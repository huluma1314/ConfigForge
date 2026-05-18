import type { RemoteResource } from "../domain/types";

function transformFormatTokens(url: string, target: "qx" | "surge" | "clash"): string {
  const replacement =
    target === "qx" ? "QuantumultX" : target === "surge" ? "Surge" : "Clash";
  return url
    .replace(/QuantumultX/g, replacement)
    .replace(/Quantumult-X/g, replacement)
    .replace(/\bQX\b/g, replacement)
    .replace(/Surge/g, replacement)
    .replace(/Clash/g, replacement);
}

function transformQxRuleSetUrl(url: string, target: "qx" | "surge" | "clash"): string {
  return transformFormatTokens(url, target);
}

function transformQxProxyProviderUrl(url: string, target: "qx" | "surge" | "clash"): string {
  return transformFormatTokens(url, target);
}

export function getRemoteResourceUrlsForTarget(resource: RemoteResource, targetFormat: "qx" | "surge" | "clash"): string[] {
  if (targetFormat === "surge") {
    if (resource.kind === "rule-provider") {
      return [transformQxRuleSetUrl(resource.url, "surge")];
    }
    if (resource.kind === "proxy-provider") {
      return [transformQxProxyProviderUrl(resource.url, "surge")];
    }
  }

  if (targetFormat === "clash") {
    if (resource.kind === "rule-provider") {
      return [transformQxRuleSetUrl(resource.url, "clash")];
    }
    if (resource.kind === "proxy-provider") {
      return [transformQxProxyProviderUrl(resource.url, "clash")];
    }
  }

  return [resource.url];
}

export function getRemoteResourceContentForTarget(
  resource: RemoteResource,
  content: string,
  targetFormat: "qx" | "surge" | "clash"
): string {
  const replacement =
    targetFormat === "qx" ? "QuantumultX" : targetFormat === "surge" ? "Surge" : "Clash";
  return content
    .replace(/rule\/QuantumultX\//g, `rule/${replacement}/`)
    .replace(/rule\/Quantumult-X\//g, `rule/${replacement}/`)
    .replace(/rule\/QX\//g, `rule/${replacement}/`)
    .replace(/rule\/Surge\//g, `rule/${replacement}/`)
    .replace(/rule\/Clash\//g, `rule/${replacement}/`)
    .replace(/\/QuantumultX\//g, `/${replacement}/`)
    .replace(/\/Quantumult-X\//g, `/${replacement}/`)
    .replace(/\/QX\//g, `/${replacement}/`)
    .replace(/\/Surge\//g, `/${replacement}/`)
    .replace(/\/Clash\//g, `/${replacement}/`);
}
