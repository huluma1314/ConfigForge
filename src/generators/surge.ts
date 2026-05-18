import { buildSurgeGeneral } from "./general-mapper";
import { collectIgnoredSectionWarnings, renderIgnoredSectionsAsComments } from "./ignored-sections";
import { collectTopLevelSectionWarnings, renderTopLevelSectionsAsComments } from "./top-level-sections";
import { mapPolicyType } from "../mappings/policies";
import { mapRuleType } from "../mappings/rules";
import { buildSyntheticProxyGroup, resolvePolicyReference } from "./policy-resolver";
import { resolvePolicyPathForGroup } from "./provider-links";
import { getRuleRank, sortRulesForTarget } from "./rule-order";
import { getRemoteResourceUrlsForTarget } from "../remote/transformers";
import { formatIniSection } from "../utils/text";
import { WarningCollector } from "../utils/warnings";
import type { ConfigIR, GeneratedProxyLine } from "../domain/types";

function isSurgeSupportedProxyType(type: string): boolean {
  return ["ss", "vmess", "trojan", "http", "https", "socks5", "socks"].includes(type);
}

function renderSurgeRule(rule: ConfigIR["rules"][number], ir: ConfigIR, warnings: WarningCollector) {
  const mapped = mapRuleType("surge", rule.type);
  if (mapped.approximate) warnings.add("approximate", `${rule.raw ?? rule.type}: ${mapped.approximate}`);
  const parts =
    mapped.type === "FINAL"
      ? [mapped.type, resolvePolicyReference(ir, "surge", rule.target)]
      : [mapped.type, rule.value, resolvePolicyReference(ir, "surge", rule.target)].filter(Boolean);
  if (rule.noResolve) parts.push("no-resolve");
  return parts.join(", ");
}

function renderProxyLine(proxy: ConfigIR["proxies"][number]): GeneratedProxyLine {
  if (!isSurgeSupportedProxyType(proxy.type)) {
    const preservedLine = proxy.raw
      ? proxy.raw.includes("=")
        ? proxy.raw
        : `${proxy.name} = ${proxy.raw}`
      : `${proxy.name} = ${proxy.type}, ${proxy.server ?? ""}${proxy.port ? `, ${proxy.port}` : ""}`.replace(/,\s*$/, "");
    return {
      name: proxy.name,
      supported: false,
      line: `; ${preservedLine}`,
      comment: `${proxy.name}: Surge 不支持 ${proxy.type}，已注释保留`
    };
  }

  const parts = [proxy.type, proxy.server, proxy.port].filter((value) => value !== undefined);
  if (proxy.type === "ss" && proxy.cipher) parts.push(`encrypt-method=${proxy.cipher}`);
  if (proxy.password) parts.push(`password=${proxy.password}`);
  if (proxy.username) parts.push(`username=${proxy.username}`);
  if (proxy.uuid) parts.push(`uuid=${proxy.uuid}`);
  if (proxy.network) parts.push(`obfs=${proxy.network}`);
  if (proxy.sni) parts.push(`sni=${proxy.sni}`);
  if (proxy.path) parts.push(`path=${proxy.path}`);
  if (proxy.host) parts.push(`obfs-host=${proxy.host}`);
  if (proxy.tls !== undefined) parts.push(`tls=${proxy.tls}`);
  if (proxy.udp !== undefined) parts.push(`udp-relay=${proxy.udp}`);
  return {
    name: proxy.name,
    supported: true,
    line: `${proxy.name} = ${parts.join(", ")}`,
    comment: undefined
  };
}

export function generateSurge(ir: ConfigIR) {
  const warnings = new WarningCollector();
  collectIgnoredSectionWarnings(ir, warnings);
  collectTopLevelSectionWarnings(ir, warnings);
  const syntheticProxyGroup = buildSyntheticProxyGroup(ir);
  const workingGroups = syntheticProxyGroup ? [...ir.policyGroups, syntheticProxyGroup] : ir.policyGroups;

  const generalResult = buildSurgeGeneral(ir, warnings);
  const proxyRenderResults = ir.proxies.map(renderProxyLine);
  const proxyLines = proxyRenderResults.map((item) => item.line);
  const unsupportedProxyLines = proxyRenderResults
    .filter((item) => !item.supported)
    .flatMap((item) => (item.comment ? [`; ${item.comment}`, item.line] : [item.line]));
  const unsupportedProxyNames = new Set(proxyRenderResults.filter((item) => !item.supported).map((item) => item.name));
  const policyLines = workingGroups.map((group) => {
    const mapped = mapPolicyType("surge", group.type);
    if (mapped.approximate) warnings.add("approximate", `${group.name}: ${mapped.approximate}`);
    const resolvedProxies = group.proxies
      .filter((item) => !unsupportedProxyNames.has(item))
      .map((item) => resolvePolicyReference(ir, "surge", item));
    const tokens = [mapped.type, ...resolvedProxies];
    const resolvedPolicyPath = resolvePolicyPathForGroup(ir, group);
    if (resolvedPolicyPath) {
      tokens.push(`policy-path=${resolvedPolicyPath}`);
      if (!group.policyPath && group.use.length > 0) {
        warnings.add("approximate", `${group.name}: Clash provider 已近似映射为 Surge policy-path`);
      }
    }
    if (group.url) tokens.push(`url=${group.url}`);
    if (group.interval) tokens.push(`interval=${group.interval}`);
    return `${group.name} = ${tokens.join(", ")}`;
  });

  const sortedRules = sortRulesForTarget(ir.rules);
  const normalRuleLines = sortedRules
    .filter((rule) => getRuleRank(rule) === 0)
    .map((rule) => renderSurgeRule(rule, ir, warnings));
  const remoteRuleLines = ir.remoteResources
    .filter((resource) => resource.kind === "rule-provider")
    .map((resource) => {
      const url = getRemoteResourceUrlsForTarget(resource, "surge")[0] ?? resource.url;
      const policy = resolvePolicyReference(ir, "surge", resource.policy ?? "DIRECT");
      if (resource.ruleSetStyle === "domain-set") {
        return ["DOMAIN-SET", url, policy].join(", ");
      }
      return ["RULE-SET", url, policy].join(", ");
    });
  const ipRuleLines = sortedRules
    .filter((rule) => getRuleRank(rule) === 2)
    .map((rule) => renderSurgeRule(rule, ir, warnings));
  const terminalRuleLines = sortedRules
    .filter((rule) => getRuleRank(rule) === 3)
    .map((rule) => renderSurgeRule(rule, ir, warnings));
  const preRuleCommentBlocks = [
    unsupportedProxyLines.length > 0
      ? `; Surge Unsupported Proxies\n${unsupportedProxyLines.join("\n")}\n; End Surge Unsupported Proxies`
      : "",
    renderIgnoredSectionsAsComments(ir, "ini").trim(),
    renderTopLevelSectionsAsComments(ir, ";").trim(),
    generalResult.preserved.length > 0
      ? `; Surge General Preserved\n${generalResult.preserved.map((line) => `; ${line}`).join("\n")}\n; End Surge General Preserved`
      : ""
  ].filter(Boolean);

  return {
    content: (
      [
        formatIniSection("General", generalResult.lines),
        ...(preRuleCommentBlocks.length > 0 ? [preRuleCommentBlocks.join("\n\n")] : []),
        formatIniSection("Proxy", proxyLines),
        formatIniSection("Proxy Group", policyLines),
        formatIniSection("Rule", [...normalRuleLines, ...remoteRuleLines, ...ipRuleLines, ...terminalRuleLines])
      ]
        .join("\n\n")
    ).trim(),
    warnings: warnings.list()
  };
}
