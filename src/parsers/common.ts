import type { ProxyNode } from "../domain/types";
import { normalizeProxyType } from "../mappings/proxies";
import { parseCsvSegments, parseKeyValueSegments } from "../utils/text";

export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function hydrateProxyFields(proxy: ProxyNode, extra: Record<string, string> | undefined): ProxyNode {
  if (!extra) {
    return proxy;
  }

  proxy.password ??= extra.password;
  proxy.username ??= extra.username;
  proxy.uuid ??= extra.uuid;
  proxy.cipher ??= extra.method ?? extra.cipher ?? extra["encrypt-method"];
  proxy.sni ??= extra.sni ?? extra["obfs-host"] ?? extra.host ?? extra.servername;
  proxy.host ??= extra.host ?? extra["obfs-host"] ?? extra["ws-headers"];
  proxy.path ??= extra.path ?? extra["obfs-uri"] ?? extra["ws-path"];
  proxy.network ??= extra.network ?? extra.type ?? extra.obfs;
  proxy.flow ??= extra.flow;
  proxy.security ??= extra.security;
  proxy.tls ??= parseBoolean(extra.tls) ?? parseBoolean(extra["over-tls"]);
  proxy.udp ??= parseBoolean(extra.udp) ?? parseBoolean(extra["udp-relay"]);
  proxy.skipCertVerify ??=
    parseBoolean(extra["skip-cert-verify"]) ??
    (extra["tls-verification"]
      ? !parseBoolean(extra["tls-verification"])
      : undefined);

  if (extra.alpn) {
    proxy.alpn = extra.alpn
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  proxy.plugin ??= extra.plugin ?? extra.obfs;

  if ((proxy.type === "vless" || proxy.type === "vmess") && !proxy.uuid && proxy.password) {
    proxy.uuid = proxy.password;
    proxy.password = undefined;
  }

  if (proxy.network === "wss") {
    proxy.network = "ws";
    proxy.tls ??= true;
  }

  if (proxy.network === "h2") {
    proxy.tls ??= true;
  }

  return proxy;
}

export function parseHostPort(input: string): { server?: string; port?: number } {
  const [server, port] = input.split(":");
  return {
    server: server?.trim() || undefined,
    port: port ? Number(port.trim()) : undefined
  };
}

export function parseServerLocalLine(line: string): ProxyNode | undefined {
  const [rawType, ...rest] = line.split("=");
  if (!rawType || rest.length === 0) {
    return undefined;
  }

  const type = normalizeProxyType(rawType.trim());
  const segments = parseCsvSegments(rest.join("="));
  const endpoint = parseHostPort(segments[0] ?? "");
  const extra = parseKeyValueSegments(rest.join("="));
  const name = extra.tag ?? `${type}-${endpoint.server ?? "proxy"}`;

  const proxy: ProxyNode = {
    id: `${name}-${endpoint.server ?? "proxy"}`,
    name,
    type,
    server: endpoint.server,
    port: endpoint.port,
    extra,
    raw: line
  };

  return hydrateProxyFields(proxy, extra);
}

export function parseNamedProxyLine(line: string): ProxyNode | undefined {
  const [rawName, ...rest] = line.split("=");
  if (!rawName || rest.length === 0) {
    return undefined;
  }

  const name = rawName.trim();
  const segments = parseCsvSegments(rest.join("="));
  const type = normalizeProxyType(segments[0] ?? "unknown");
  const endpoint = {
    server: segments[1]?.trim(),
    port: segments[2] ? Number(segments[2].trim()) : undefined
  };
  const extra = parseKeyValueSegments(rest.join("="));

  const proxy: ProxyNode = {
    id: `${name}-${endpoint.server ?? "proxy"}`,
    name,
    type,
    server: endpoint.server,
    port: endpoint.port,
    extra,
    raw: line
  };

  return hydrateProxyFields(proxy, extra);
}
