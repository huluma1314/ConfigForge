import { normalizeProxyType } from "../mappings/proxies";
import { safeDecodeURIComponent } from "../utils/text";
import type { ProxyNode } from "../domain/types";

export function decodeBase64(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  if (typeof Buffer !== "undefined") {
    return Buffer.from(normalized + padding, "base64").toString("utf8");
  }
  if (typeof atob !== "undefined") {
    const binary = atob(normalized + padding);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Base64 decoder is unavailable in current runtime");
}

function parseVmessUri(rest: string, nameHint?: string): ProxyNode | undefined {
  const [encoded, fragment] = rest.split("#", 2);
  const decoded = decodeBase64(encoded);
  const payload = JSON.parse(decoded) as Record<string, string>;
  const server = payload.add ?? payload.host;
  if (!server) {
    return undefined;
  }

  const name = safeDecodeURIComponent(fragment ?? payload.ps ?? nameHint ?? server);
  return {
    id: `${name}-${server}-${payload.port ?? ""}`,
    name,
    type: "vmess",
    server,
    port: payload.port ? Number(payload.port) : undefined,
    uuid: payload.id,
    alterId: payload.aid ? Number(payload.aid) : undefined,
    cipher: payload.scy ?? payload.cipher,
    network: payload.net,
    path: payload.path,
    host: payload.host,
    sni: payload.sni,
    tls: payload.tls === "tls" || payload.security === "tls",
    security: payload.security ?? payload.tls,
    raw: `vmess://${rest}`
  };
}

export function parseProxyUri(uri: string, nameHint?: string): ProxyNode | undefined {
  if (!uri.includes("://")) {
    return undefined;
  }

  const [scheme, rest] = uri.split("://", 2);
  const type = normalizeProxyType(scheme);

  if (type === "vmess") {
    try {
      return parseVmessUri(rest, nameHint);
    } catch {
      return undefined;
    }
  }

  if (type === "ss") {
    const [encoded, fragment] = rest.split("#");
    const decoded = decodeBase64(encoded);
    const match = decoded.match(/^(.*?):(.*?)@(.*?):(\d+)$/);
    if (!match) {
      return undefined;
    }
    return {
      id: `${nameHint ?? fragment ?? "ss"}-${match[3]}-${match[4]}`,
      name: safeDecodeURIComponent(fragment ?? nameHint ?? "SS"),
      type,
      cipher: match[1],
      password: match[2],
      server: match[3],
      port: Number(match[4]),
      raw: uri
    };
  }

  try {
    const parsed = new URL(uri);
    const credential = safeDecodeURIComponent(parsed.username);
    const name = safeDecodeURIComponent(parsed.hash.replace(/^#/, "") || nameHint || parsed.hostname);
    return {
      id: `${nameHint ?? parsed.hash.slice(1) ?? type}-${parsed.hostname}-${parsed.port}`,
      name,
      type,
      server: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      username: type === "http" || type === "https" || type === "socks5" ? credential || undefined : undefined,
      password:
        type === "trojan"
          ? credential || undefined
          : type === "http" || type === "https" || type === "socks5"
            ? safeDecodeURIComponent(parsed.password) || undefined
            : undefined,
      uuid: type === "vless" ? credential || undefined : undefined,
      sni: parsed.searchParams.get("sni") ?? undefined,
      network: parsed.searchParams.get("type") ?? undefined,
      path: parsed.searchParams.get("path") ?? undefined,
      host: parsed.searchParams.get("host") ?? undefined,
      security: parsed.searchParams.get("security") ?? undefined,
      raw: uri
    };
  } catch {
    return undefined;
  }
}
