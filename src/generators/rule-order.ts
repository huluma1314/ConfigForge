import type { Rule } from "../domain/types";

export function getRuleRank(rule: Rule): number {
  switch (rule.type) {
    case "DOMAIN":
    case "DOMAIN-SUFFIX":
    case "DOMAIN-KEYWORD":
    case "USER-AGENT":
    case "URL-REGEX":
      return 0;
    case "FINAL":
    case "MATCH":
      return 3;
    case "GEOIP":
    case "GEOSITE":
    case "IP-CIDR":
    case "IP-CIDR6":
    case "PROCESS-NAME":
      return 2;
    default:
      return 2;
  }
}

export function sortRulesForTarget(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => getRuleRank(a) - getRuleRank(b));
}
