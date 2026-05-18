import { createEmptyConfigIR } from "../domain/factory";
import type { ParseResult, PolicyGroup, ProxyNode, Rule } from "../domain/types";
import { normalizePolicyType } from "../mappings/policies";
import { normalizeRuleType } from "../mappings/rules";
import { parseNamedProxyLine, parseServerLocalLine } from "./common";
import { parseIniSections } from "./ini";
import { parseProxyUri } from "./uri";
import { parseCsvSegments, parseKeyValueSegments } from "../utils/text";

function isEnabled(extra: Record<string, string> | undefined): boolean {
  const enabled = extra?.enabled?.trim().toLowerCase();
  return enabled !== "false";
}

function pushIgnoredSectionLine(
  ignoredSections: NonNullable<ReturnType<typeof createEmptyConfigIR>["metadata"]["ignoredSections"]>,
  key: "serverRemote" | "filterRemote",
  line: string
): void {
  ignoredSections[key] = [...(ignoredSections[key] ?? []), line];
}

function matchProxyNamesByRegex(regexSource: string | undefined, proxyNames: string[]): string[] {
  if (!regexSource) {
    return [];
  }

  try {
    const regex = new RegExp(regexSource, "i");
    return proxyNames.filter((name) => regex.test(name));
  } catch {
    return [];
  }
}

export function parseQX(input: string): ParseResult<ReturnType<typeof createEmptyConfigIR>> {
  const ir = createEmptyConfigIR();
  ir.metadata.sourceFormat = "qx";
  ir.metadata.ignoredSections = {};
  const deferredPolicyEntries: string[] = [];

  for (const section of parseIniSections(input)) {
    const name = section.name.toLowerCase();
    if (name === "general" || name === "dns") {
      for (const entry of section.entries) {
        const [key, ...rest] = entry.content.split("=");
        if (!key || rest.length === 0) {
          continue;
        }
        const normalizedKey = name === "dns" ? `dns.${key.trim()}` : key.trim();
        const value = rest.join("=").trim();
        if (ir.general[normalizedKey]) {
          ir.general[normalizedKey] = `${ir.general[normalizedKey]}\n${value}`;
        } else {
          ir.general[normalizedKey] = value;
        }
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

        const parsed = parseNamedProxyLine(entry.content);
        if (parsed) {
          ir.proxies.push(parsed);
        }
      }
    } else if (name === "server_local") {
      for (const entry of section.entries) {
        const parsed = parseServerLocalLine(entry.content);
        if (parsed) {
          ir.proxies.push(parsed);
        }
      }
    } else if (name === "server_remote") {
      for (const entry of section.entries) {
        const segments = parseCsvSegments(entry.content);
        const url = segments[0];
        const extra = parseKeyValueSegments(entry.content);
        if (!url) {
          continue;
        }
        if (!isEnabled(extra)) {
          pushIgnoredSectionLine(ir.metadata.ignoredSections, "serverRemote", entry.content);
          continue;
        }
        ir.remoteResources.push({
          url,
          kind: "proxy-provider",
          owner: extra.tag ?? url,
          enabled: true
        });
      }
    } else if (name === "policy") {
      deferredPolicyEntries.push(...section.entries.map((entry) => entry.content));
    } else if (name === "proxy_group") {
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
        group.filter = group.extra?.["policy-regex-filter"];
        group.url = group.extra?.url;
        group.interval = group.extra?.interval ? Number(group.extra.interval) : undefined;
        if (group.policyPath) {
          ir.remoteResources.push({ url: group.policyPath, kind: "policy-path", owner: groupName });
        }
        ir.policyGroups.push(group);
      }
    } else if (name === "filter_local" || name === "rule") {
      for (const entry of section.entries) {
        const segments = parseCsvSegments(entry.content);
        const type = normalizeRuleType(segments[0] ?? "UNKNOWN");
        const isTerminal = type === "FINAL" || type === "MATCH";
        const rule: Rule = {
          type,
          value: isTerminal ? undefined : segments[1],
          target: isTerminal ? segments[1] ?? "DIRECT" : segments[2] ?? "DIRECT",
          noResolve: segments.includes("no-resolve"),
          raw: entry.content
        };
        ir.rules.push(rule);
      }
    } else if (name === "filter_remote") {
      for (const entry of section.entries) {
        const segments = parseCsvSegments(entry.content);
        const url = segments[0];
        const extra = parseKeyValueSegments(entry.content);
        if (!url) {
          continue;
        }
        if (!isEnabled(extra)) {
          pushIgnoredSectionLine(ir.metadata.ignoredSections, "filterRemote", entry.content);
          continue;
        }
        ir.remoteResources.push({
          url,
          kind: "rule-provider",
          owner: extra.tag ?? url,
          policy: extra["force-policy"] ?? "DIRECT",
          enabled: true,
          ruleSetStyle: url.includes("AWAvenue-Ads-Rule") ? "domain-set" : "rule-set"
        });
      }
    } else if (name === "rewrite_remote" || name === "rewrite_local") {
      ir.metadata.ignoredSections.rewrite = [
        ...(ir.metadata.ignoredSections.rewrite ?? []),
        ...section.entries.map((entry) => entry.content)
      ];
    } else if (name === "task_local") {
      ir.metadata.ignoredSections.task = [
        ...(ir.metadata.ignoredSections.task ?? []),
        ...section.entries.map((entry) => entry.content)
      ];
    } else if (name === "mitm") {
      ir.metadata.ignoredSections.mitm = [
        ...(ir.metadata.ignoredSections.mitm ?? []),
        ...section.entries.map((entry) => entry.content)
      ];
    }
  }

  const remoteProviderNames = ir.remoteResources
    .filter((resource) => resource.kind === "proxy-provider" && resource.owner)
    .map((resource) => resource.owner as string);
  const proxyNames = ir.proxies.map((proxy) => proxy.name);

  for (const line of deferredPolicyEntries) {
    const [rawType, ...rest] = line.split("=");
    if (!rawType || rest.length === 0) {
      continue;
    }
    const type = normalizePolicyType(rawType);
    const segments = parseCsvSegments(rest.join("="));
    const groupName = segments[0];
    const extra = parseKeyValueSegments(rest.join("="));
    const explicitRefs = segments.slice(1).filter((segment) => !segment.includes("="));
    const regexMatches = matchProxyNamesByRegex(extra["server-tag-regex"], proxyNames);
    const group: PolicyGroup = {
      name: groupName,
      type,
      proxies: [...new Set([...explicitRefs, ...regexMatches])],
      use: extra["server-tag-regex"] ? remoteProviderNames : [],
      url: ir.general.server_check_url,
      interval: extra["check-interval"] ? Number(extra["check-interval"]) : undefined,
      tolerance: extra.tolerance ? Number(extra.tolerance) : undefined,
      filter: extra["server-tag-regex"],
      extra
    };
    ir.policyGroups.push(group);
  }

  return { data: ir, warnings: [] };
}
