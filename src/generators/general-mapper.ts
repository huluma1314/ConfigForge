import type { ConfigIR } from "../domain/types";
import { WarningCollector } from "../utils/warnings";

function splitStoredLines(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseQxDnsAddressLines(lines: string[]) {
  const hosts: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^\/(.+)\/(.+)$/);
    if (!match) {
      continue;
    }
    hosts[match[1]] = match[2];
  }
  return hosts;
}

export function buildClashGeneral(ir: ConfigIR, warnings: WarningCollector) {
  const general: Record<string, unknown> = {};
  const dnsServers = splitStoredLines(ir.general["dns.server"]);
  const dnsAddresses = splitStoredLines(ir.general["dns.address"]);
  const dnsPolicyServers = dnsServers.filter((line) => line.startsWith("/"));
  const plainDnsServers = dnsServers.filter((line) => !line.startsWith("/"));

  if (plainDnsServers.length > 0 || dnsAddresses.length > 0) {
    general.dns = {
      enable: true,
      nameserver: plainDnsServers.length > 0 ? plainDnsServers : undefined,
      hosts: Object.keys(parseQxDnsAddressLines(dnsAddresses)).length
        ? parseQxDnsAddressLines(dnsAddresses)
        : undefined
    };
  }

  const droppedKeys = Object.keys(ir.general).filter(
    (key) => !["dns.server", "dns.address"].includes(key)
  );

  if (droppedKeys.length > 0) {
    warnings.add(
      "limitation",
      `以下 QX general/dns 字段未映射到 Clash: ${droppedKeys.join(", ")}`
    );
  }

  if (dnsPolicyServers.length > 0) {
    warnings.add(
      "limitation",
      `以下 QX DNS 定向解析规则未映射到 Clash: ${dnsPolicyServers.join(" | ")}`
    );
  }

  if (ir.remoteResources.some((item) => item.kind === "rule-template")) {
    warnings.add("info", "检测到 Clash 原生顶层能力（如 dns/sniffer），当前仅保留为可见输入，不做语义转换");
  }

  return general;
}

export function buildSurgeGeneral(ir: ConfigIR, warnings: WarningCollector) {
  const lines: string[] = [];
  const preserved: string[] = [];
  const dnsServers = splitStoredLines(ir.general["dns.server"]);
  const dnsAddresses = splitStoredLines(ir.general["dns.address"]);
  const plainDnsServers = dnsServers.filter((line) => !line.startsWith("/"));
  const dnsPolicyServers = dnsServers.filter((line) => line.startsWith("/"));
  const allowLan = ir.general["allow-lan"];
  const logLevel = ir.general["log-level"];
  const externalController = ir.general["external-controller"];
  const ipv6 = ir.general["dns.ipv6"];
  const mixedPort = ir.general["mixed-port"];
  const bindAddress = ir.general["bind-address"];
  const findProcessMode = ir.general["find-process-mode"];

  if (plainDnsServers.length > 0) {
    lines.push(`dns-server = ${plainDnsServers.join(", ")}`);
  }
  if (allowLan) {
    lines.push(`allow-wifi-access = ${allowLan}`);
  }
  if (logLevel) {
    lines.push(`loglevel = ${logLevel}`);
  }
  if (mixedPort) {
    const host = bindAddress === "*" ? "0.0.0.0" : bindAddress ?? "0.0.0.0";
    lines.push(`http-listen = ${host}:${mixedPort}`);
    lines.push(`socks5-listen = ${host}:${mixedPort}`);
  }
  if (ipv6) {
    lines.push(`ipv6 = ${ipv6}`);
  }
  if (externalController) {
    preserved.push(`external-controller = ${externalController}`);
  }
  if (findProcessMode) {
    preserved.push(`find-process-mode = ${findProcessMode}`);
  }
  if (bindAddress) {
    preserved.push(`bind-address = ${bindAddress}`);
  }
  if (ir.general.mode && ir.general.mode !== "rule") {
    preserved.push(`mode = ${ir.general.mode}`);
  }
  for (const key of Object.keys(ir.general)) {
    if (["dns.server", "dns.address", "allow-lan", "log-level", "mixed-port", "bind-address", "find-process-mode", "dns.ipv6", "external-controller", "mode"].includes(key)) {
      continue;
    }
    if (key.startsWith("Filter")) {
      preserved.push(`${key} = ${ir.general[key]}`);
    }
  }

  const droppedKeys = Object.keys(ir.general).filter(
    (key) => ![
      "dns.server",
      "dns.address",
      "allow-lan",
      "log-level",
      "mixed-port",
      "bind-address",
      "find-process-mode",
      "dns.ipv6",
      "external-controller",
      "mode"
    ].includes(key) && !key.startsWith("Filter")
  );

  if (droppedKeys.length > 0) {
    warnings.add(
      "limitation",
      `以下 QX general/dns 字段未映射到 Surge: ${droppedKeys.join(", ")}`
    );
  }

  if (dnsPolicyServers.length > 0 || dnsAddresses.length > 0) {
    warnings.add("limitation", "QX DNS 定向解析/hosts 映射未完整映射到 Surge");
  }

  if (externalController || findProcessMode || bindAddress || (ir.general.mode && ir.general.mode !== "rule") || preserved.some((line) => line.startsWith("Filter"))) {
    warnings.add("info", "部分 Clash General 项已保留为注释，因为 Surge 没有完全等价的配置项");
  }

  return { lines, preserved };
}
