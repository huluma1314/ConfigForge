import yaml from "js-yaml";
import { buildClashGeneral } from "./general-mapper";
import { collectIgnoredSectionWarnings, renderIgnoredSectionsAsComments } from "./ignored-sections";
import { collectTopLevelSectionWarnings, renderTopLevelSectionsAsComments } from "./top-level-sections";
import { mapPolicyType } from "../mappings/policies";
import { mapRuleType } from "../mappings/rules";
import { buildClashProxyProviders, buildClashRuleProviders } from "./provider-links";
import { buildSyntheticProxyGroup, resolvePolicyReference } from "./policy-resolver";
import { sortRulesForTarget } from "./rule-order";
import { WarningCollector } from "../utils/warnings";
import type { ConfigIR } from "../domain/types";

function renderClashRule(rule: ConfigIR["rules"][number], ir: ConfigIR, warnings: WarningCollector) {
  const mapped = mapRuleType("clash", rule.type);
  if (mapped.approximate) warnings.add("approximate", `${rule.raw ?? rule.type}: ${mapped.approximate}`);
  const parts =
    mapped.type === "MATCH"
      ? [mapped.type, resolvePolicyReference(ir, "clash", rule.target)]
      : [mapped.type, rule.value, resolvePolicyReference(ir, "clash", rule.target)].filter(Boolean);
  if (rule.noResolve) parts.push("no-resolve");
  return parts.join(",");
}

function renderClashProxy(proxy: ConfigIR["proxies"][number]) {
  const base: Record<string, unknown> = {
    name: proxy.name,
    type: proxy.type,
    server: proxy.server,
    port: proxy.port,
    udp: proxy.udp
  };

  if (proxy.type === "ss") {
    base.cipher = proxy.cipher;
    base.password = proxy.password;
  } else if (proxy.type === "vless" || proxy.type === "vmess") {
    base.uuid = proxy.uuid;
    base.network = proxy.network;
    base.tls = proxy.tls;
    base["skip-cert-verify"] = proxy.skipCertVerify;
    base.servername = proxy.sni;
    base["ws-opts"] =
      proxy.network === "ws"
        ? {
            path: proxy.path,
            headers: proxy.host ? { Host: proxy.host } : undefined
          }
        : undefined;
    base.flow = proxy.flow;
    base.security = proxy.security;
  } else {
    base.password = proxy.password;
    base.username = proxy.username;
    base.sni = proxy.sni;
    base.network = proxy.network;
    base.tls = proxy.tls;
    base["skip-cert-verify"] = proxy.skipCertVerify;
    base.path = proxy.path;
    base.host = proxy.host;
  }

  return base;
}

export function generateClash(ir: ConfigIR) {
  const warnings = new WarningCollector();
  collectIgnoredSectionWarnings(ir, warnings);
  collectTopLevelSectionWarnings(ir, warnings);
  const syntheticProxyGroup = buildSyntheticProxyGroup(ir);
  const workingGroups = syntheticProxyGroup ? [...ir.policyGroups, syntheticProxyGroup] : ir.policyGroups;
  const providerLinks = buildClashProxyProviders(ir);
  const ruleProviders = buildClashRuleProviders(ir);

  const document: Record<string, unknown> = {
    ...buildClashGeneral(ir, warnings),
    proxies: ir.proxies.map(renderClashProxy),
    "proxy-groups": workingGroups.map((group) => {
      const mapped = mapPolicyType("clash", group.type);
      if (mapped.approximate) warnings.add("approximate", `${group.name}: ${mapped.approximate}`);
      return {
        name: group.name,
        type: mapped.type,
        proxies: [...new Set(group.proxies.map((item) => resolvePolicyReference(ir, "clash", item)))],
        use: providerLinks.resolveUse(group).length ? providerLinks.resolveUse(group) : undefined,
        url: group.url,
        interval: group.interval,
        tolerance: group.tolerance,
        filter: group.filter
      };
    }),
    ...(
      Object.keys(ruleProviders).length > 0
        ? {
            rules: [
              ...sortRulesForTarget(ir.rules)
                .filter((rule) => rule.type !== "FINAL" && rule.type !== "MATCH")
                .map((rule) => renderClashRule(rule, ir, warnings)),
              ...ir.remoteResources
                .filter((resource) => resource.kind === "rule-provider" && resource.owner)
                .map((resource) =>
                  [
                    "RULE-SET",
                    resource.owner,
                    resolvePolicyReference(ir, "clash", resource.policy ?? "DIRECT")
                  ].join(",")
                ),
              ...sortRulesForTarget(ir.rules)
                .filter((rule) => rule.type === "FINAL" || rule.type === "MATCH")
                .map((rule) => renderClashRule(rule, ir, warnings))
            ]
          }
        : {}
    )
  };

  if (Object.keys(ruleProviders).length === 0) {
    document.rules = sortRulesForTarget(ir.rules).map((rule) => {
      const mapped = mapRuleType("clash", rule.type);
      if (mapped.approximate) warnings.add("approximate", `${rule.raw ?? rule.type}: ${mapped.approximate}`);
      const parts =
        mapped.type === "MATCH"
          ? [mapped.type, resolvePolicyReference(ir, "clash", rule.target)]
          : [mapped.type, rule.value, resolvePolicyReference(ir, "clash", rule.target)].filter(Boolean);
      if (rule.noResolve) parts.push("no-resolve");
      return parts.join(",");
    });
  }

  if (Object.keys(providerLinks.providers).length > 0) {
    document["proxy-providers"] = providerLinks.providers;
  }

  if (Object.keys(ruleProviders).length > 0) {
    document["rule-providers"] = ruleProviders;
  }

  return {
    content: (
      yaml.dump(document, {
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
      }).trim() + renderIgnoredSectionsAsComments(ir, "yaml") + renderTopLevelSectionsAsComments(ir, "#")
    ).trim(),
    warnings: warnings.list()
  };
}
