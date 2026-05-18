import { createEmptyConfigIR } from "../domain/factory";
import type { ParseResult, PolicyGroup, ProxyNode, Rule } from "../domain/types";
import { normalizePolicyType } from "../mappings/policies";
import { normalizeProxyType } from "../mappings/proxies";
import { normalizeRuleType } from "../mappings/rules";
import { hydrateProxyFields } from "./common";
import { parseIniSections } from "./ini";
import { extractPreservedUnsupportedSurgeProxies } from "./preserved-comments";
import { parseProxyUri } from "./uri";
import { parseCsvSegments, parseKeyValueSegments } from "../utils/text";
import { deriveResourceOwnerFromUrl } from "../utils/urls";

export function parseSurge(input: string): ParseResult<ReturnType<typeof createEmptyConfigIR>> {
  const ir = createEmptyConfigIR();
  ir.metadata.sourceFormat = "surge";
  ir.metadata.ignoredSections = {};
  ir.metadata.preservedUnsupportedProxies = [];

  const preservedUnsupported = extractPreservedUnsupportedSurgeProxies(input);
  if (preservedUnsupported.length > 0) {
    ir.proxies.push(...preservedUnsupported);
    ir.metadata.preservedUnsupportedProxies = preservedUnsupported.map((item) => item.raw ?? `${item.name} = ${item.type}`);
  }

  for (const section of parseIniSections(input)) {
    const name = section.name.toLowerCase();
    if (name === "general") {
      for (const entry of section.entries) {
        const [key, ...rest] = entry.content.split("=");
        if (!key || rest.length === 0) {
          continue;
        }
        ir.general[key.trim()] = rest.join("=").trim();
      }
    } else if (name === "proxy") {
      for (const entry of section.entries) {
        const [rawName, ...rest] = entry.content.split("=");
        if (!rawName || rest.length === 0) {
          continue;
        }
        const nameValue = rawName.trim();
        const body = rest.join("=").trim();
        const uriProxy = parseProxyUri(body, nameValue);
        if (uriProxy) {
          ir.proxies.push({ ...uriProxy, name: nameValue, id: `${nameValue}-${uriProxy.server ?? "uri"}` });
          continue;
        }

        const segments = parseCsvSegments(body);
        const normalizedBuiltIn = (segments[0] ?? "").trim().toLowerCase();
        if (normalizedBuiltIn === "direct" || normalizedBuiltIn === "reject") {
          continue;
        }

        const proxy: ProxyNode = {
          id: `${nameValue}-${segments[1] ?? "proxy"}`,
          name: nameValue,
          type: normalizeProxyType(segments[0] ?? "unknown"),
          server: segments[1],
          port: segments[2] ? Number(segments[2]) : undefined,
          extra: parseKeyValueSegments(body),
          raw: entry.content
        };
        ir.proxies.push(hydrateProxyFields(proxy, proxy.extra));
      }
    } else if (name === "proxy group") {
      for (const entry of section.entries) {
        const [rawName, ...rest] = entry.content.split("=");
        if (!rawName || rest.length === 0) {
          continue;
        }
        const groupName = rawName.trim();
        const segments = parseCsvSegments(rest.join("="));
        const type = normalizePolicyType(segments[0] ?? "unknown");
        const group: PolicyGroup = {
          name: groupName,
          type,
          proxies: segments.slice(1).filter((segment) => !segment.includes("=") && !segment.startsWith("http")),
          use: [],
          extra: parseKeyValueSegments(rest.join("="))
        };
        group.policyPath = group.extra?.["policy-path"];
        group.url = group.extra?.url;
        group.interval = group.extra?.interval ? Number(group.extra.interval) : undefined;
        if (group.policyPath) {
          ir.remoteResources.push({ url: group.policyPath, kind: "policy-path", owner: groupName });
        }
        ir.policyGroups.push(group);
      }
    } else if (name === "rule") {
      for (const entry of section.entries) {
        const segments = parseCsvSegments(entry.content);
        const rawType = (segments[0] ?? "UNKNOWN").trim().toUpperCase();

        if (rawType === "RULE-SET") {
          const url = segments[1];
          const policy = segments[2] ?? "DIRECT";
          if (url) {
            ir.remoteResources.push({
              url,
              kind: "rule-provider",
              owner: deriveResourceOwnerFromUrl(url),
              policy,
              enabled: true
            });
          }
          continue;
        }

        const type = normalizeRuleType(segments[0] ?? "UNKNOWN");
        const isTerminal = type === "FINAL" || type === "MATCH";
        ir.rules.push({
          type,
          value: isTerminal ? undefined : segments[1],
          target: isTerminal ? segments[1] ?? "DIRECT" : segments[2] ?? "DIRECT",
          noResolve: segments.includes("no-resolve"),
          raw: entry.content
        });
      }
    } else if (name === "mitm") {
      ir.metadata.ignoredSections.mitm = [
        ...(ir.metadata.ignoredSections.mitm ?? []),
        ...section.entries.map((entry) => entry.content)
      ];
    }
  }

  return { data: ir, warnings: [] };
}
