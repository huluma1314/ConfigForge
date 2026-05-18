import yaml from "js-yaml";
import { createEmptyConfigIR } from "../domain/factory";
import type { ParseResult, PolicyGroup, ProxyNode, Rule } from "../domain/types";
import { normalizePolicyType } from "../mappings/policies";
import { normalizeProxyType } from "../mappings/proxies";
import { normalizeRuleType } from "../mappings/rules";
import { parseCsvSegments } from "../utils/text";
import { deriveResourceOwnerFromUrl } from "../utils/urls";

interface ClashInput {
  [key: string]: unknown;
  proxies?: Array<Record<string, unknown>>;
  "proxy-groups"?: Array<Record<string, unknown>>;
  rules?: Array<string | Record<string, unknown>>;
  "proxy-providers"?: Record<string, Record<string, unknown>>;
  "rule-providers"?: Record<string, Record<string, unknown>>;
}

function normalizeClashRuleEntry(ruleEntry: string | Record<string, unknown>): string {
  if (typeof ruleEntry === "string") {
    return ruleEntry;
  }

  const key = Object.keys(ruleEntry)[0] ?? "UNKNOWN";
  const payload = ruleEntry[key];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const body = payload as Record<string, unknown>;
    const match = String(body.match ?? body.value ?? "");
    const policy = String(body.policy ?? body.target ?? "DIRECT");
    const type = key.replace(/_/g, "-").toUpperCase();

    if (type === "DEFAULT") {
      return ["MATCH", policy].join(",");
    }
    if (type === "RULE-SET") {
      return ["RULE-SET", match, policy].join(",");
    }
    if (type === "DOMAIN" && match === "") {
      return ["MATCH", policy].join(",");
    }
    if (["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6", "GEOIP", "GEOSITE", "USER-AGENT", "PROCESS-NAME", "URL-REGEX"].includes(type)) {
      return [type, match, policy].filter(Boolean).join(",");
    }
    if (type === "PROTOCOL") {
      return ["RULE-SET", match, policy].join(",");
    }
    return [type, match, policy].filter(Boolean).join(",");
  }

  return String(ruleEntry);
}

function appendGeneralValue(ir: ReturnType<typeof createEmptyConfigIR>, key: string, value: string): void {
  if (ir.general[key]) {
    ir.general[key] = `${ir.general[key]}\n${value}`;
  } else {
    ir.general[key] = value;
  }
}

export function parseClash(input: string): ParseResult<ReturnType<typeof createEmptyConfigIR>> {
  const ir = createEmptyConfigIR();
  ir.metadata.sourceFormat = "clash";
  ir.metadata.ignoredTopLevelSections = [];
  const document = (yaml.load(input) as ClashInput) ?? {};

  for (const [key, value] of Object.entries(document)) {
    if (["proxies", "proxy-groups", "rules", "proxy-providers", "rule-providers"].includes(key)) {
      continue;
    }
    if (key === "dns" && value && typeof value === "object" && !Array.isArray(value)) {
      const dns = value as Record<string, unknown>;
      const collectServers = (input: unknown) =>
        Array.isArray(input) ? input.map((item) => String(item)) : [];
      const upstream = [
        ...collectServers(dns["default-nameserver"]),
        ...collectServers(dns.nameserver),
        ...collectServers(dns["proxy-server-nameserver"]),
        ...collectServers(dns.fallback)
      ];
      if (upstream.length > 0) {
        appendGeneralValue(ir, "dns.server", [...new Set(upstream)].join(", "));
      }
      if (typeof dns.ipv6 === "boolean") {
        ir.general["dns.ipv6"] = String(dns.ipv6);
      }
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      ir.general[key] = String(value);
    } else if (value && typeof value === "object") {
      ir.metadata.ignoredTopLevelSections?.push(key);
    }
  }

  for (const proxyEntry of document.proxies ?? []) {
    const proxy: ProxyNode = {
      id: `${String(proxyEntry.name ?? "proxy")}-${String(proxyEntry.server ?? "node")}`,
      name: String(proxyEntry.name ?? "Unnamed"),
      type: normalizeProxyType(String(proxyEntry.type ?? "unknown")),
      server: proxyEntry.server ? String(proxyEntry.server) : undefined,
      port: proxyEntry.port ? Number(proxyEntry.port) : undefined,
      cipher: proxyEntry.cipher ? String(proxyEntry.cipher) : undefined,
      password: proxyEntry.password ? String(proxyEntry.password) : undefined,
      uuid: proxyEntry.uuid ? String(proxyEntry.uuid) : undefined,
      network: proxyEntry.network ? String(proxyEntry.network) : undefined,
      sni: proxyEntry.sni ? String(proxyEntry.sni) : undefined,
      path: proxyEntry.path ? String(proxyEntry.path) : undefined,
      host: proxyEntry.host ? String(proxyEntry.host) : undefined,
      udp: typeof proxyEntry.udp === "boolean" ? proxyEntry.udp : undefined,
      tls: typeof proxyEntry.tls === "boolean" ? proxyEntry.tls : undefined,
      username: proxyEntry.username ? String(proxyEntry.username) : undefined,
      skipCertVerify:
        typeof proxyEntry["skip-cert-verify"] === "boolean"
          ? Boolean(proxyEntry["skip-cert-verify"])
          : undefined,
      flow: proxyEntry.flow ? String(proxyEntry.flow) : undefined,
      security: proxyEntry.security ? String(proxyEntry.security) : undefined,
      plugin: proxyEntry.plugin ? String(proxyEntry.plugin) : undefined,
      extra: Object.fromEntries(
        Object.entries(proxyEntry).map(([key, value]) => [key, String(value)])
      )
    };
    ir.proxies.push(proxy);
  }

  for (const groupEntry of document["proxy-groups"] ?? []) {
    const group: PolicyGroup = {
      name: String(groupEntry.name ?? "Unnamed Group"),
      type: normalizePolicyType(String(groupEntry.type ?? "unknown")),
      proxies: Array.isArray(groupEntry.proxies)
        ? groupEntry.proxies.map((value) => String(value))
        : [],
      use: Array.isArray(groupEntry.use)
        ? groupEntry.use.map((value) => String(value))
        : [],
      url: groupEntry.url ? String(groupEntry.url) : undefined,
      interval: groupEntry.interval ? Number(groupEntry.interval) : undefined,
      tolerance: groupEntry.tolerance ? Number(groupEntry.tolerance) : undefined,
      filter: groupEntry.filter ? String(groupEntry.filter) : undefined,
      extra: Object.fromEntries(
        Object.entries(groupEntry).map(([key, value]) => [key, String(value)])
      )
    };
    ir.policyGroups.push(group);
  }

  for (const ruleLine of document.rules ?? []) {
    const normalizedRuleLine = normalizeClashRuleEntry(ruleLine);
    const ruleTokens = parseCsvSegments(normalizedRuleLine);
    const rawType = ruleTokens[0] ?? "UNKNOWN";
    const type = normalizeRuleType(rawType);
    if (rawType.toUpperCase() === "RULE-SET") {
      const url = ruleTokens[1];
      const policy = ruleTokens[2] ?? "DIRECT";
      if (url) {
        ir.remoteResources.push({
          url,
          kind: "rule-provider",
          owner: deriveResourceOwnerFromUrl(url),
          policy,
          enabled: ruleTokens.indexOf("disabled") === -1
        });
      }
      continue;
    }
    const isTerminal = rawType.toUpperCase() === "MATCH" || rawType.toUpperCase() === "FINAL";
    const rule: Rule = {
      type,
      value: isTerminal ? undefined : ruleTokens[1],
      target: isTerminal ? ruleTokens[1] ?? "DIRECT" : ruleTokens[2] ?? "DIRECT",
      noResolve: ruleTokens.includes("no-resolve"),
      raw: normalizedRuleLine
    };
    ir.rules.push(rule);
  }

  for (const [name, provider] of Object.entries(document["proxy-providers"] ?? {})) {
    const url = provider.url ? String(provider.url) : undefined;
    if (url) {
      ir.remoteResources.push({ url, kind: "proxy-provider", owner: name });
    }
  }

  for (const [name, provider] of Object.entries(document["rule-providers"] ?? {})) {
    const url = provider.url ? String(provider.url) : undefined;
    if (url) {
      ir.remoteResources.push({ url, kind: "rule-provider", owner: name });
    }
  }

  for (const [key, value] of Object.entries(document)) {
    if (["proxies", "proxy-groups", "rules", "proxy-providers", "rule-providers"].includes(key)) {
      continue;
    }
  }

  return { data: ir, warnings: [] };
}
