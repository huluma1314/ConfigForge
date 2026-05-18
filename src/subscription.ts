import { createEmptyConfigIR } from "./domain/factory";
import type { ConfigFormat, ProxyNode, WarningItem } from "./domain/types";
import { generateConfig } from "./generators";
import { parseConfig } from "./parsers";
import { parseNamedProxyLine, parseServerLocalLine } from "./parsers/common";
import { decodeBase64, parseProxyUri } from "./parsers/uri";
import { splitLines } from "./utils/text";

export type SubscriptionTargetFormat = ConfigFormat | "uri-list" | "base64-uri";
export type SubscriptionOutputMode = "content" | "link";

export interface SubscriptionBackendOption {
  label: string;
  value: string;
  note: string;
}

export const DEFAULT_SUBSCRIPTION_CONVERTER_BASE_URL = "https://api.wcc.best/sub";
export const SUBSCRIPTION_CONVERTER_BACKENDS: SubscriptionBackendOption[] = [
  {
    label: "api.wcc.best",
    value: "https://api.wcc.best/sub",
    note: "已验证可用，默认推荐。"
  },
  {
    label: "api.dler.io",
    value: "https://api.dler.io/sub",
    note: "已验证可用，兼容性也正常。"
  },
  {
    label: "api.v1.mk",
    value: "https://api.v1.mk/sub",
    note: "已验证可用，可作为备用。"
  }
];

export interface SubscriptionTransformOptions {
  inputMode: "url" | "text";
  targetFormat: SubscriptionTargetFormat;
  outputMode?: SubscriptionOutputMode;
  converterBaseUrl?: string;
}

export interface SubscriptionTransformResult {
  content?: string;
  fileName?: string;
  proxies: ProxyNode[];
  log: string[];
  warnings: WarningItem[];
}

function looksLikeBase64Subscription(input: string): boolean {
  const compact = input.replace(/\s+/g, "");
  return compact.length > 24 && /^[A-Za-z0-9+/_=-]+$/.test(compact);
}

function tryDecodeSubscription(input: string): string {
  if (!looksLikeBase64Subscription(input)) {
    return input;
  }

  try {
    const decoded = decodeBase64(input.replace(/\s+/g, ""));
    if (decoded.includes("://") || decoded.includes("proxies:") || decoded.includes("[Proxy]")) {
      return decoded;
    }
  } catch {
    return input;
  }

  return input;
}

function unwrapProxyText(input: string): string {
  const marker = "Markdown Content:";
  const markerIndex = input.indexOf(marker);
  if (markerIndex >= 0) {
    return input.slice(markerIndex + marker.length).trim();
  }
  return input;
}

function parseProxyLines(input: string): ProxyNode[] {
  const proxies: ProxyNode[] = [];

  for (const line of splitLines(input)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    const uriProxy = parseProxyUri(trimmed);
    if (uriProxy) {
      proxies.push(uriProxy);
      continue;
    }

    const namedProxy = parseNamedProxyLine(trimmed) ?? parseServerLocalLine(trimmed);
    if (namedProxy) {
      proxies.push(namedProxy);
    }
  }

  return proxies;
}

function dedupeProxies(proxies: ProxyNode[]): ProxyNode[] {
  const seen = new Map<string, ProxyNode>();
  for (const proxy of proxies) {
    const key = proxy.name || `${proxy.type}-${proxy.server ?? "unknown"}-${proxy.port ?? ""}`;
    seen.set(key, proxy);
  }
  return [...seen.values()];
}

function parseSubscriptionContent(input: string): ProxyNode[] {
  const decoded = tryDecodeSubscription(unwrapProxyText(input));
  const lineProxies = parseProxyLines(decoded);
  if (lineProxies.length > 0) {
    return dedupeProxies(lineProxies);
  }

  try {
    return dedupeProxies(parseConfig(decoded).data.proxies);
  } catch {
    return [];
  }
}

function buildProxyOnlyIR(proxies: ProxyNode[]) {
  const ir = createEmptyConfigIR();
  ir.proxies = proxies;
  ir.policyGroups = [
    {
      name: "Proxy",
      type: "select",
      proxies: proxies.map((proxy) => proxy.name),
      use: []
    }
  ];
  ir.rules = [{ type: "FINAL", target: "Proxy" }];
  return ir;
}

function renderUriList(proxies: ProxyNode[]): string {
  return proxies
    .map((proxy) => proxy.raw)
    .filter((value): value is string => Boolean(value && value.includes("://")))
    .join("\n");
}

function encodeBase64Utf8(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function normalizeConverterBaseUrl(converterBaseUrl?: string): string {
  const baseUrl = (converterBaseUrl || DEFAULT_SUBSCRIPTION_CONVERTER_BASE_URL).trim();
  return baseUrl.replace(/[?&]+$/, "");
}

function extractSubscriptionUrls(input: string): string[] {
  return splitLines(input)
    .map((line) => line.trim())
    .filter((line) => Boolean(line && line.includes("://")));
}

function getSubscriptionDownloadName(format: SubscriptionTargetFormat): string {
  switch (format) {
    case "qx":
      return "configforge-subscription-qx.conf";
    case "surge":
      return "configforge-subscription-surge.conf";
    case "clash":
      return "configforge-subscription-clash.yaml";
    case "uri-list":
      return "configforge-subscription-uri.txt";
    case "base64-uri":
      return "configforge-subscription-base64.txt";
  }
}

function mapTargetToSubconverter(format: SubscriptionTargetFormat): string {
  switch (format) {
    case "qx":
      return "quanx";
    case "surge":
      return "surge";
    case "clash":
      return "clash";
    case "uri-list":
      return "mixed";
    case "base64-uri":
      return "mixed";
  }
}

function buildSubscriptionConvertLink(
  input: string,
  format: SubscriptionTargetFormat,
  converterBaseUrl = DEFAULT_SUBSCRIPTION_CONVERTER_BASE_URL
): string {
  const urls = extractSubscriptionUrls(input);
  if (urls.length === 0) {
    throw new Error("链接模式需要至少一个可识别的订阅 URL。");
  }

  const params = new URLSearchParams({
    target: mapTargetToSubconverter(format),
    url: urls.join("|"),
    emoji: "true",
    list: "false",
    udp: "true",
    tfo: "false",
    scv: "false",
    fdn: "false",
    sort: "false"
  });
  return `${normalizeConverterBaseUrl(converterBaseUrl)}?${params.toString()}`;
}

async function loadSubscriptionInput(input: string, inputMode: "url" | "text", log: string[]): Promise<string> {
  if (inputMode === "text") {
    log.push("已读取粘贴的订阅内容");
    return input;
  }

  const urls = splitLines(input).filter((line) => line.trim());
  const chunks: string[] = [];
  for (const url of urls) {
    log.push(`拉取订阅: ${url}`);
    const fallbackUrls = [url, `https://r.jina.ai/http://${url}`, `https://r.jina.ai/http://https://${url}`];
    let lastError = "";
    let text = "";
    for (const candidate of fallbackUrls) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) {
          lastError = `${candidate} 返回 HTTP ${response.status}`;
          continue;
        }
        text = unwrapProxyText(await response.text());
        if (text.trim()) {
          if (candidate !== url) {
            log.push(`已使用代理入口拉取: ${url}`);
          }
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "拉取失败";
      }
    }
    if (!text.trim()) {
      throw new Error(lastError || `${url} 拉取失败`);
    }
    chunks.push(text);
    log.push(`已拉取订阅: ${url}`);
  }
  return chunks.join("\n");
}

export async function transformSubscription(
  input: string,
  options: SubscriptionTransformOptions
): Promise<SubscriptionTransformResult> {
  const log: string[] = [];
  const warnings: WarningItem[] = [];

  try {
    if (options.outputMode === "link") {
      const content = buildSubscriptionConvertLink(input, options.targetFormat, options.converterBaseUrl);
      log.push(`已生成订阅转换链接: ${normalizeConverterBaseUrl(options.converterBaseUrl)}`);
      return {
        content,
        fileName: "configforge-subscription-link.txt",
        proxies: [],
        log,
        warnings: [
          {
            level: "info",
            message: "链接模式不会在本地解析节点，实际转换由订阅转换后端完成。"
          }
        ]
      };
    }

    const rawContent = await loadSubscriptionInput(input, options.inputMode, log);
    const proxies = parseSubscriptionContent(rawContent);
    log.push(`解析完成: ${proxies.length} 个节点`);

    if (proxies.length === 0) {
      return {
        proxies,
        log,
        warnings: [{ level: "limitation", message: "没有解析到可转换的节点。" }]
      };
    }

    let content: string;
    if (options.targetFormat === "uri-list" || options.targetFormat === "base64-uri") {
      const uriList = renderUriList(proxies);
      if (!uriList) {
        warnings.push({ level: "limitation", message: "当前节点缺少原始 URI，只能导出 QX / Surge / Clash 文件。" });
        content = "";
      } else {
        content = options.targetFormat === "base64-uri" ? encodeBase64Utf8(uriList) : uriList;
      }
    } else {
      content = generateConfig(buildProxyOnlyIR(proxies), options.targetFormat).content;
    }

    log.push(`生成完成: ${options.targetFormat}`);
    return {
      content,
      fileName: getSubscriptionDownloadName(options.targetFormat),
      proxies,
      log,
      warnings
    };
  } catch (error) {
    return {
      proxies: [],
      log,
      warnings: [
        {
          level: "limitation",
          message: error instanceof Error ? error.message : "订阅转换失败"
        }
      ]
    };
  }
}
