import type { ConfigIR, PolicyGroup, ProxyNode, Rule } from "./types";

function mergeProxyLists(base: ProxyNode[], incoming: ProxyNode[]): ProxyNode[] {
  const map = new Map<string, ProxyNode>();
  for (const item of base) {
    map.set(item.name, item);
  }
  for (const item of incoming) {
    map.set(item.name, { ...map.get(item.name), ...item });
  }
  return [...map.values()];
}

function mergePolicyLists(base: PolicyGroup[], incoming: PolicyGroup[]): PolicyGroup[] {
  const map = new Map<string, PolicyGroup>();
  for (const item of base) {
    map.set(item.name, item);
  }
  for (const item of incoming) {
    map.set(item.name, {
      ...(map.get(item.name) ?? item),
      ...item,
      proxies: item.proxies.length ? item.proxies : (map.get(item.name)?.proxies ?? []),
      use: item.use.length ? item.use : (map.get(item.name)?.use ?? [])
    });
  }
  return [...map.values()];
}

function mergeRuleLists(base: Rule[], incoming: Rule[]): Rule[] {
  const seen = new Set(base.map((item) => `${item.type}:${item.value ?? ""}:${item.target}`));
  const merged = [...base];
  for (const item of incoming) {
    const key = `${item.type}:${item.value ?? ""}:${item.target}`;
    if (!seen.has(key)) {
      merged.push(item);
      seen.add(key);
    }
  }
  return merged;
}

export function mergeConfigIR(base: ConfigIR, incoming: Partial<ConfigIR>): ConfigIR {
  return {
    ...base,
    general: { ...incoming.general, ...base.general },
    proxies: mergeProxyLists(base.proxies, incoming.proxies ?? []),
    policyGroups: mergePolicyLists(base.policyGroups, incoming.policyGroups ?? []),
    rules: mergeRuleLists(base.rules, incoming.rules ?? []),
    remoteResources: [...base.remoteResources, ...(incoming.remoteResources ?? [])],
    metadata: {
      ...base.metadata,
      ...incoming.metadata
    }
  };
}
