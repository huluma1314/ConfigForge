import { createEmptyConfigIR } from "../domain/factory";
import { mergeConfigIR } from "../domain/merge";
import type { ConfigIR, RemoteResource, Rule } from "../domain/types";
import { normalizeRuleType } from "../mappings/rules";
import { parseConfig } from "../parsers";
import { parseQX } from "../parsers/qx";
import { parseSurge } from "../parsers/surge";
import { decodeBase64, parseProxyUri } from "../parsers/uri";
import { parseCsvSegments, splitLines } from "../utils/text";
import type { RemoteFetchResult } from "./fetcher";
import { getRemoteResourceContentForTarget, getRemoteResourceUrlsForTarget } from "./transformers";

function parseRuleLine(ruleLine: string, defaultPolicy?: string): Rule | undefined {
  const segments = parseCsvSegments(ruleLine);
  if (segments.length < 2) {
    return undefined;
  }
  const type = normalizeRuleType(segments[0] ?? "UNKNOWN");
  const isTerminal = type === "FINAL" || type === "MATCH";
  const hasExplicitPolicy = isTerminal ? segments.length >= 2 : segments.length >= 3;
  return {
    type,
    value: isTerminal ? undefined : segments[1],
    target: isTerminal
      ? (hasExplicitPolicy ? segments[1] : defaultPolicy) ?? "DIRECT"
      : (hasExplicitPolicy ? segments[2] : defaultPolicy) ?? "DIRECT",
    noResolve: segments.includes("no-resolve"),
    raw: ruleLine
  };
}

function parseRemoteProxyCollection(content: string, resource: RemoteResource): Partial<ConfigIR> {
  const lines = splitLines(content).filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));
  const ir = createEmptyConfigIR();

  for (const line of lines) {
    const uriProxy = parseProxyUri(line, resource.owner);
    if (uriProxy) {
      ir.proxies.push({ ...uriProxy, source: resource.url });
      continue;
    }
  }

  if (ir.proxies.length > 0) {
    return ir;
  }

  try {
    const parsed = parseQX(`[proxy]\n${lines.join("\n")}`).data;
    if (parsed.proxies.length > 0) {
      return { proxies: parsed.proxies };
    }
  } catch {
    // Fall through to Surge parser.
  }

  try {
    const parsed = parseSurge(`[Proxy]\n${lines.join("\n")}`).data;
    if (parsed.proxies.length > 0) {
      return { proxies: parsed.proxies };
    }
  } catch {
    // Fall through to generic config parser.
  }

  try {
    const parsed = parseConfig(content).data;
    if (parsed.proxies.length > 0) {
      return { proxies: parsed.proxies };
    }
  } catch {
    // Final fallback below.
  }

  return ir;
}

function parseRemoteRuleCollection(content: string, defaultPolicy?: string): Partial<ConfigIR> {
  const lines = splitLines(content).filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));
  const ir = createEmptyConfigIR();
  for (const line of lines) {
    const normalizedLine =
      line.includes(",") || line.includes("=")
        ? line
        : line.startsWith(".")
          ? `DOMAIN-SUFFIX,${line.slice(1)}${defaultPolicy ? `,${defaultPolicy}` : ""}`
          : `DOMAIN-SUFFIX,${line}${defaultPolicy ? `,${defaultPolicy}` : ""}`;
    const parsed = parseRuleLine(normalizedLine, defaultPolicy);
    if (parsed) {
      ir.rules.push(parsed);
    }
  }
  return ir;
}

function decodeBase64Text(content: string): string | undefined {
  const compact = content.replace(/\s+/g, "");
  if (compact.length < 32 || !/^[A-Za-z0-9+/_=-]+$/.test(compact)) {
    return undefined;
  }

  try {
    const decoded = decodeBase64(compact);
    if (decoded.includes("://") || decoded.includes("\n") || decoded.includes("proxies:") || decoded.includes("DOMAIN") || decoded.includes("ss://") || decoded.includes("vmess://")) {
      return decoded;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isSurgeClassicalRuleLine(line: string): boolean {
  return /^(DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|IP-CIDR6?|GEOIP|PROCESS-NAME|USER-AGENT|URL-REGEX|FINAL|MATCH|RULE-SET)\b/i.test(
    line.trim()
  );
}

function shouldInlineSurgeRuleProvider(content: string): boolean {
  const lines = splitLines(content).filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));
  if (lines.length === 0) {
    return false;
  }
  return lines.some((line) => line.startsWith(".") || line.includes("://") || !isSurgeClassicalRuleLine(line));
}

function shouldInlineSurgeProxyProvider(content: string): boolean {
  return Boolean(decodeBase64Text(content.trim()));
}

function parseProviderPayload(content: string, resource: RemoteResource): Partial<ConfigIR> {
  const trimmed = content.trim();
  const decoded = decodeBase64Text(trimmed);
  const payload = decoded ?? trimmed;

  if (resource.kind === "proxy-provider") {
    return parseRemoteProxyCollection(payload, resource);
  }

  try {
    return parseConfig(payload).data;
  } catch {
    if (resource.kind === "rule-provider") {
      const payloadMatch = payload.match(/payload:\s*([\s\S]*)$/m);
      if (payloadMatch) {
        const payloadLines = payloadMatch[1]
          .split("\n")
          .map((line) => line.replace(/^\s*-\s*/, "").trim())
          .filter(Boolean);
        return parseRemoteRuleCollection(payloadLines.join("\n"), resource.policy);
      }
      return parseRemoteRuleCollection(payload, resource.policy);
    }
  }

  return createEmptyConfigIR();
}

function mergeUniqueNames(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])];
}

function applyInlinedProxyProviderToGroups(
  ir: ConfigIR,
  resource: RemoteResource,
  parsedProxyNames: string[]
): ConfigIR {
  if (parsedProxyNames.length === 0) {
    return ir;
  }

  return {
    ...ir,
    policyGroups: ir.policyGroups.map((group) => {
      const referencesOwner = resource.owner && group.use.includes(resource.owner);
      const referencesPath = group.policyPath === resource.url;
      if (!referencesOwner && !referencesPath) {
        return group;
      }

      const regexMatches =
        group.filter && referencesOwner
          ? (() => {
              try {
                const regex = new RegExp(group.filter, "i");
                return parsedProxyNames.filter((name) => regex.test(name));
              } catch {
                return [];
              }
            })()
          : referencesOwner
            ? parsedProxyNames
            : [];

      const mergedProxies = mergeUniqueNames(group.proxies, referencesPath ? parsedProxyNames : regexMatches);
      const remainingUse = resource.owner ? group.use.filter((item) => item !== resource.owner) : group.use;

      return {
        ...group,
        proxies: mergedProxies,
        use: remainingUse,
        policyPath: referencesOwner || referencesPath ? undefined : group.policyPath
      };
    })
  };
}

function dropUnavailableProxyProviderFromGroups(ir: ConfigIR, resource: RemoteResource): ConfigIR {
  return {
    ...ir,
    policyGroups: ir.policyGroups.map((group) => {
      const referencesOwner = resource.owner ? group.use.includes(resource.owner) : false;
      const referencesPath = group.policyPath === resource.url;
      if (!referencesOwner && !referencesPath) {
        return group;
      }

      return {
        ...group,
        use: resource.owner ? group.use.filter((item) => item !== resource.owner) : group.use,
        policyPath: referencesPath || referencesOwner ? undefined : group.policyPath
      };
    })
  };
}

export function integrateRemoteResources(
  base: ConfigIR,
  resources: RemoteResource[],
  results: RemoteFetchResult[],
  targetFormat: "qx" | "surge" | "clash",
  options?: {
    expandRemoteRules?: boolean;
    expandRemoteProxies?: boolean;
  }
) {
  let merged = base;
  const notes: string[] = [];
  const consumedUrls = new Set<string>();
  const failedUrls = new Set(results.filter((result) => !result.ok).map((result) => result.url));

  for (const result of results) {
    const resource = resources.find((item) => item.url === result.url);
    if (!resource || !result.ok || !result.content) {
      continue;
    }

    try {
      const adaptedContent = getRemoteResourceContentForTarget(resource, result.content, targetFormat);
      const transformedUrls = getRemoteResourceUrlsForTarget(resource, targetFormat);
      if (transformedUrls[0] && transformedUrls[0] !== resource.url) {
        notes.push(`远程资源地址已适配为 ${targetFormat}: ${resource.url} -> ${transformedUrls[0]}`);
      }

      const forceInlineRuleProvider =
        targetFormat === "surge" && resource.kind === "rule-provider" && shouldInlineSurgeRuleProvider(adaptedContent);
      const forceInlineProxyProvider =
        targetFormat === "surge" && resource.kind === "proxy-provider" && shouldInlineSurgeProxyProvider(adaptedContent);
      const selectedInlineRuleProvider = options?.expandRemoteRules === true && resource.kind === "rule-provider";
      const selectedInlineProxyProvider = options?.expandRemoteProxies === true && resource.kind === "proxy-provider";

      if (forceInlineRuleProvider || forceInlineProxyProvider || selectedInlineRuleProvider || selectedInlineProxyProvider) {
        const parsed = parseProviderPayload(adaptedContent, resource);
        merged = mergeConfigIR(merged, parsed);
        if (resource.kind === "proxy-provider") {
          merged = applyInlinedProxyProviderToGroups(merged, resource, parsed.proxies?.map((proxy) => proxy.name) ?? []);
        }
        notes.push(
          forceInlineRuleProvider || forceInlineProxyProvider
            ? `远程资源 ${result.url} 与 ${targetFormat} 兼容性不佳，已自动展开到本地`
            : `已并入远程资源: ${result.url}`
        );
        consumedUrls.add(result.url);
      } else if (resource.kind === "proxy-provider" && targetFormat === "surge") {
        const parsed = parseProviderPayload(adaptedContent, resource);
        merged = mergeConfigIR(merged, parsed);
        merged = applyInlinedProxyProviderToGroups(merged, resource, parsed.proxies?.map((proxy) => proxy.name) ?? []);
        notes.push(`远程节点订阅已自动并入本地: ${result.url}`);
        consumedUrls.add(result.url);
      }
    } catch (error) {
      notes.push(
        `远程资源内容未能解析并入: ${result.url} (${error instanceof Error ? error.message : "未知错误"})`
      );
    }
  }

  if (targetFormat === "surge") {
    for (const resource of resources) {
      if (resource.kind !== "proxy-provider" || !failedUrls.has(resource.url)) {
        continue;
      }
      merged = dropUnavailableProxyProviderFromGroups(merged, resource);
      notes.push(`远程节点订阅不可用，已移除 Surge 外部引用: ${resource.url}`);
      consumedUrls.add(resource.url);
    }
  }

  merged.remoteResources = merged.remoteResources.filter((resource) => !consumedUrls.has(resource.url));

  return { ir: merged, notes };
}
