import type { ConfigIR, PolicyGroup } from "../domain/types";
import { getRemoteResourceUrlsForTarget } from "../remote/transformers";

function providerKeyFromGroup(group: PolicyGroup): string {
  return `${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-provider`;
}

export function resolvePolicyPathForGroup(ir: ConfigIR, group: PolicyGroup): string | undefined {
  if (group.policyPath) {
    const stillRemote = ir.remoteResources.some(
      (item) => item.url === group.policyPath && item.kind === "proxy-provider"
    );
    if (stillRemote) {
      return group.policyPath;
    }
  }

  if (group.use.length === 0) {
    return undefined;
  }

  for (const providerName of group.use) {
    const resource = ir.remoteResources.find(
      (item) => item.owner === providerName && item.kind === "proxy-provider"
    );
    if (resource?.url) {
      return resource.url;
    }
  }

  return undefined;
}

export function buildClashProxyProviders(ir: ConfigIR) {
  const providers: Record<string, Record<string, unknown>> = {};
  const groupUseMap = new Map<string, string[]>();

  for (const resource of ir.remoteResources) {
    if (resource.kind === "proxy-provider" && resource.owner && resource.enabled !== false) {
      providers[resource.owner] = {
        type: "http",
        url: getRemoteResourceUrlsForTarget(resource, "clash")[0] ?? resource.url,
        interval: 3600,
        path: `./providers/${resource.owner}.yaml`,
        "health-check": {
          enable: true,
          url: "http://www.gstatic.com/generate_204",
          interval: 600
        }
      };
    }
  }

  for (const group of ir.policyGroups) {
    if (!group.policyPath) {
      continue;
    }
    const providerName = providerKeyFromGroup(group);
    providers[providerName] = {
      type: "http",
      url: group.policyPath,
      interval: group.interval ?? 3600,
      path: `./providers/${providerName}.yaml`,
      "health-check": {
        enable: true,
        url: group.url ?? "http://www.gstatic.com/generate_204",
        interval: group.interval ?? 600
      }
    };
    groupUseMap.set(group.name, [providerName]);
  }

  return {
    providers,
    resolveUse(group: PolicyGroup): string[] {
      if (group.use.length > 0) {
        return group.use;
      }
      return groupUseMap.get(group.name) ?? [];
    }
  };
}

export function buildClashRuleProviders(ir: ConfigIR) {
  const providers: Record<string, Record<string, unknown>> = {};

  for (const resource of ir.remoteResources) {
    if (resource.kind === "rule-provider" && resource.owner && resource.enabled !== false) {
      const url = getRemoteResourceUrlsForTarget(resource, "clash")[0] ?? resource.url;
      providers[resource.owner] = {
        type: "http",
        behavior: "classical",
        url,
        path: `./rulesets/${resource.owner}.list`,
        interval: 86400
      };
    }
  }

  return providers;
}
