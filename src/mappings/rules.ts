import type { ConfigFormat, RuleType } from "../domain/types";

const targetRuleTypeMap: Record<
  ConfigFormat,
  Partial<Record<RuleType, { type: string; approximate?: string; drop?: boolean }>>
> = {
  qx: {
    DOMAIN: { type: "HOST" },
    "DOMAIN-SUFFIX": { type: "HOST-SUFFIX" },
    "DOMAIN-KEYWORD": { type: "HOST-KEYWORD" },
    "IP-CIDR": { type: "IP-CIDR" },
    "IP-CIDR6": { type: "IP-CIDR6" },
    GEOIP: { type: "GEOIP" },
    GEOSITE: { type: "HOST-KEYWORD", approximate: "QX 无 GEOSITE，已近似为 HOST-KEYWORD" },
    "USER-AGENT": { type: "USER-AGENT" },
    "PROCESS-NAME": { type: "HOST-KEYWORD", approximate: "QX 无 PROCESS-NAME，已近似为 HOST-KEYWORD" },
    "URL-REGEX": { type: "URL-REGEX" },
    FINAL: { type: "FINAL" },
    MATCH: { type: "FINAL" }
  },
  surge: {
    DOMAIN: { type: "DOMAIN" },
    "DOMAIN-SUFFIX": { type: "DOMAIN-SUFFIX" },
    "DOMAIN-KEYWORD": { type: "DOMAIN-KEYWORD" },
    "IP-CIDR": { type: "IP-CIDR" },
    "IP-CIDR6": { type: "IP-CIDR6" },
    GEOIP: { type: "GEOIP" },
    GEOSITE: { type: "GEOSITE" },
    "USER-AGENT": { type: "USER-AGENT" },
    "PROCESS-NAME": { type: "PROCESS-NAME" },
    "URL-REGEX": { type: "URL-REGEX" },
    FINAL: { type: "FINAL" },
    MATCH: { type: "FINAL" }
  },
  clash: {
    DOMAIN: { type: "DOMAIN" },
    "DOMAIN-SUFFIX": { type: "DOMAIN-SUFFIX" },
    "DOMAIN-KEYWORD": { type: "DOMAIN-KEYWORD" },
    "IP-CIDR": { type: "IP-CIDR" },
    "IP-CIDR6": { type: "IP-CIDR6" },
    GEOIP: { type: "GEOIP" },
    GEOSITE: { type: "GEOSITE" },
    "USER-AGENT": { type: "DOMAIN-KEYWORD", approximate: "Clash 无 USER-AGENT，已近似为 DOMAIN-KEYWORD" },
    "PROCESS-NAME": { type: "PROCESS-NAME" },
    "URL-REGEX": { type: "DOMAIN-KEYWORD", approximate: "Clash 无 URL-REGEX，已近似为 DOMAIN-KEYWORD" },
    FINAL: { type: "MATCH" },
    MATCH: { type: "MATCH" }
  }
};

export function mapRuleType(targetFormat: ConfigFormat, ruleType: RuleType) {
  return targetRuleTypeMap[targetFormat][ruleType] ?? { type: ruleType, approximate: "规则类型未显式映射，原样输出" };
}

export function normalizeRuleType(rawType: string): RuleType {
  const normalized = rawType.trim().toUpperCase();
  if (normalized === "IP6-CIDR") {
    return "IP-CIDR6";
  }
  switch (normalized) {
    case "HOST":
      return "DOMAIN";
    case "HOST-SUFFIX":
      return "DOMAIN-SUFFIX";
    case "HOST-KEYWORD":
      return "DOMAIN-KEYWORD";
    case "MATCH":
      return "MATCH";
    case "FINAL":
      return "FINAL";
    case "DOMAIN":
    case "DOMAIN-SUFFIX":
    case "DOMAIN-KEYWORD":
    case "IP-CIDR":
    case "IP6-CIDR":
    case "IP-CIDR6":
    case "GEOIP":
    case "GEOSITE":
    case "USER-AGENT":
    case "PROCESS-NAME":
    case "URL-REGEX":
      return normalized;
    default:
      return "UNKNOWN";
  }
}
