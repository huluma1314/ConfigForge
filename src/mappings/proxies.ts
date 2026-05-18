import type { ProxyType } from "../domain/types";

export function normalizeProxyType(rawType: string): ProxyType {
  const normalized = rawType.trim().toLowerCase();
  switch (normalized) {
    case "ss":
    case "shadowsocks":
      return "ss";
    case "vmess":
      return "vmess";
    case "vless":
      return "vless";
    case "trojan":
      return "trojan";
    case "hysteria":
      return "hysteria";
    case "hysteria2":
    case "hy2":
      return "hysteria2";
    case "tuic":
      return "tuic";
    case "http":
      return "http";
    case "https":
      return "https";
    case "socks":
    case "socks5":
      return "socks5";
    default:
      return "unknown";
  }
}
