import { collectIgnoredSectionWarnings, renderIgnoredSectionsAsComments } from "./ignored-sections";
import { collectTopLevelSectionWarnings, renderTopLevelSectionsAsComments } from "./top-level-sections";
import { mapPolicyType } from "../mappings/policies";
import { mapRuleType } from "../mappings/rules";
import { resolvePolicyReference } from "./policy-resolver";
import { resolvePolicyPathForGroup } from "./provider-links";
import { getRemoteResourceUrlsForTarget } from "../remote/transformers";
import { sortRulesForTarget } from "./rule-order";
import { formatIniSection } from "../utils/text";
import { WarningCollector } from "../utils/warnings";
import type { ConfigIR } from "../domain/types";

function renderProxyLine(proxy: ConfigIR["proxies"][number]): string {
  const parts = [proxy.type, proxy.server, proxy.port].filter((value) => value !== undefined);
  if (proxy.cipher) parts.push(`method=${proxy.cipher}`);
  if (proxy.password) parts.push(`password=${proxy.password}`);
  if (proxy.username) parts.push(`username=${proxy.username}`);
  if (proxy.uuid) parts.push(`uuid=${proxy.uuid}`);
  if (proxy.network) parts.push(`obfs=${proxy.network}`);
  if (proxy.sni) parts.push(`sni=${proxy.sni}`);
  if (proxy.host) parts.push(`obfs-host=${proxy.host}`);
  if (proxy.path) parts.push(`obfs-uri=${proxy.path}`);
  if (proxy.tls !== undefined) parts.push(`over-tls=${proxy.tls}`);
  if (proxy.udp !== undefined) parts.push(`udp-relay=${proxy.udp}`);
  return `${proxy.name} = ${parts.join(", ")}`;
}

export function generateQX(ir: ConfigIR) {
  const warnings = new WarningCollector();
  collectIgnoredSectionWarnings(ir, warnings);
  collectTopLevelSectionWarnings(ir, warnings);

  const generalLines = Object.entries(ir.general).map(([key, value]) => `${key} = ${value}`);
  const proxyLines = ir.proxies.map(renderProxyLine);
  const remoteProxyLines = ir.remoteResources
    .filter((resource) => resource.kind === "proxy-provider")
    .map((resource) => {
      const tokens = [resource.url];
      if (resource.owner) tokens.push(`tag=${resource.owner}`);
      if (resource.enabled !== undefined) tokens.push(`enabled=${resource.enabled}`);
      return tokens.join(", ");
    });
  const policyLines = ir.policyGroups.map((group) => {
    const mapped = mapPolicyType("qx", group.type);
    if (mapped.approximate) warnings.add("approximate", `${group.name}: ${mapped.approximate}`);
    const tokens = [mapped.type, ...group.proxies.map((item) => resolvePolicyReference(ir, "qx", item))];
    const resolvedPolicyPath = resolvePolicyPathForGroup(ir, group);
    if (resolvedPolicyPath) {
      tokens.push(`policy-path=${resolvedPolicyPath}`);
      if (!group.policyPath && group.use.length > 0) {
        warnings.add("approximate", `${group.name}: Clash provider 已近似映射为 QX policy-path`);
      }
    }
    if (group.filter) tokens.push(`policy-regex-filter=${group.filter}`);
    if (group.url) tokens.push(`url=${group.url}`);
    if (group.interval) tokens.push(`interval=${group.interval}`);
    return `${group.name} = ${tokens.join(", ")}`;
  });

  const ruleLines = sortRulesForTarget(ir.rules).map((rule) => {
    const mapped = mapRuleType("qx", rule.type);
    if (mapped.approximate) warnings.add("approximate", `${rule.raw ?? rule.type}: ${mapped.approximate}`);
    const parts =
      mapped.type === "FINAL"
        ? [mapped.type, resolvePolicyReference(ir, "qx", rule.target)]
        : [mapped.type, rule.value, resolvePolicyReference(ir, "qx", rule.target)].filter(Boolean);
    if (rule.noResolve) parts.push("no-resolve");
    return parts.join(", ");
  });

  const remoteRuleLines = ir.remoteResources
    .filter((resource) => resource.kind === "rule-provider")
    .map((resource) => {
      const tokens = [getRemoteResourceUrlsForTarget(resource, "qx")[0] ?? resource.url];
      if (resource.owner) tokens.push(`tag=${resource.owner}`);
      tokens.push(`force-policy=${resolvePolicyReference(ir, "qx", resource.policy ?? "DIRECT")}`);
      tokens.push("enabled=true");
      return tokens.join(", ");
    });

  return {
    content: (
      [
        formatIniSection("general", generalLines),
        formatIniSection("proxy", proxyLines),
        ...(remoteProxyLines.length > 0 ? [formatIniSection("server_remote", remoteProxyLines)] : []),
        formatIniSection("proxy_group", policyLines),
        formatIniSection("rule", ruleLines),
        ...(remoteRuleLines.length > 0 ? [formatIniSection("filter_remote", remoteRuleLines)] : [])
      ]
        .join("\n")
        .trim() + renderIgnoredSectionsAsComments(ir, "ini") + renderTopLevelSectionsAsComments(ir, ";")
    ).trim(),
    warnings: warnings.list()
  };
}
