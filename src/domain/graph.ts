import type { ConfigIR, ValidationError } from "./types";

export function validatePolicyGraph(ir: ConfigIR): ValidationError[] {
  const groupNames = new Set(ir.policyGroups.map((group) => group.name));
  const edges = new Map<string, string[]>();

  ir.policyGroups.forEach((group) => {
    edges.set(
      group.name,
      group.proxies.filter((proxyName) => groupNames.has(proxyName))
    );
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const errors: ValidationError[] = [];

  function visit(name: string, trail: string[]): void {
    if (visiting.has(name)) {
      errors.push({
        message: `检测到策略组循环引用: ${[...trail, name].join(" -> ")}`
      });
      return;
    }

    if (visited.has(name)) {
      return;
    }

    visiting.add(name);
    for (const next of edges.get(name) ?? []) {
      visit(next, [...trail, name]);
    }
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of groupNames) {
    visit(name, []);
  }

  return errors;
}
