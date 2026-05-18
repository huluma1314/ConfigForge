import type { ConfigFormat, ConfigIR, PolicyGroup } from "../domain/types";

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function selectDefaultProxyPolicy(ir: ConfigIR): string | undefined {
  const explicitProxy = ir.policyGroups.find((group) => normalizeName(group.name) === "proxy");
  if (explicitProxy) {
    return explicitProxy.name;
  }

  const regexGlobal = ir.policyGroups.find((group) => group.filter === ".*" || group.filter === ".+");
  if (regexGlobal) {
    return regexGlobal.name;
  }

  if (ir.policyGroups.length > 0) {
    return ir.policyGroups[0].name;
  }

  if (ir.proxies.length > 0 || ir.remoteResources.some((item) => item.kind === "proxy-provider")) {
    return "Proxy";
  }

  return undefined;
}

export function resolvePolicyReference(
  ir: ConfigIR,
  targetFormat: ConfigFormat,
  value: string | undefined
): string | undefined {
  if (!value) {
    return value;
  }

  switch (normalizeName(value)) {
    case "direct":
      return "DIRECT";
    case "reject":
      return "REJECT";
    case "proxy":
      return selectDefaultProxyPolicy(ir) ?? (targetFormat === "clash" ? "DIRECT" : "DIRECT");
    default:
      return value;
  }
}

export function buildSyntheticProxyGroup(ir: ConfigIR): PolicyGroup | undefined {
  const existing = ir.policyGroups.find((group) => normalizeName(group.name) === "proxy");
  if (existing) {
    return undefined;
  }

  const needsProxy = [
    ...ir.rules.map((rule) => rule.target),
    ...ir.policyGroups.flatMap((group) => group.proxies)
  ].some((item) => normalizeName(item) === "proxy");

  if (!needsProxy) {
    return undefined;
  }

  const defaultPolicy = selectDefaultProxyPolicy(ir);
  if (defaultPolicy && normalizeName(defaultPolicy) !== "proxy") {
    return undefined;
  }

  return {
    name: "Proxy",
    type: "select",
    proxies: ir.proxies.map((proxy) => proxy.name),
    use: ir.remoteResources
      .filter((item) => item.kind === "proxy-provider" && item.owner)
      .map((item) => item.owner as string),
    url: ir.general.server_check_url,
    interval: 600,
    extra: {}
  };
}
