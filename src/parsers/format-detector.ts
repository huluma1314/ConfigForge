import type { ConfigFormat } from "../domain/types";

export function detectFormat(input: string): { format?: ConfigFormat; confidence: number; reason: string } {
  const text = input.trim();

  if (/^proxies:\s*$/m.test(text) || /^proxy-groups:\s*$/m.test(text)) {
    return { format: "clash", confidence: 0.95, reason: "检测到 Clash YAML 顶层字段" };
  }

  if (/\[proxy_group\]/i.test(text) || /\[filter_remote\]/i.test(text)) {
    return { format: "qx", confidence: 0.9, reason: "检测到 Quantumult X section" };
  }

  if (/\[proxy group\]/i.test(text) || /\[general\]/i.test(text) || /\[proxy\]/i.test(text)) {
    return { format: "surge", confidence: 0.7, reason: "检测到 Surge/INI 风格 section" };
  }

  if (/^\s*-\s*name:/m.test(text) || /^mixed-port:/m.test(text)) {
    return { format: "clash", confidence: 0.7, reason: "检测到 YAML 代理字段" };
  }

  return { confidence: 0.2, reason: "未检测到明显特征" };
}
