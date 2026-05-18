import type { ConfigFormat, PolicyGroupType } from "../domain/types";

const policyMap: Record<
  ConfigFormat,
  Partial<Record<PolicyGroupType, { type: string; approximate?: string }>>
> = {
  qx: {
    select: { type: "static" },
    static: { type: "static" },
    "url-test": { type: "available" },
    available: { type: "available" },
    fallback: { type: "available", approximate: "QX 无 fallback，已近似为 available" },
    "load-balance": { type: "available", approximate: "QX 无 load-balance，已近似为 available" }
  },
  surge: {
    select: { type: "select" },
    static: { type: "select" },
    "url-test": { type: "url-test" },
    available: { type: "url-test" },
    fallback: { type: "fallback" },
    "load-balance": { type: "load-balance" }
  },
  clash: {
    select: { type: "select" },
    static: { type: "select" },
    "url-test": { type: "url-test" },
    available: { type: "url-test" },
    fallback: { type: "fallback" },
    "load-balance": { type: "load-balance" }
  }
};

export function mapPolicyType(targetFormat: ConfigFormat, type: PolicyGroupType) {
  return policyMap[targetFormat][type] ?? { type: "select", approximate: `策略组类型 ${type} 未显式映射，已回退为 select` };
}

export function normalizePolicyType(rawType: string): PolicyGroupType {
  const normalized = rawType.trim().toLowerCase();
  switch (normalized) {
    case "static":
      return "static";
    case "available":
      return "available";
    case "url-latency-benchmark":
      return "url-test";
    case "round-robin":
    case "dest-hash":
      return "load-balance";
    case "select":
      return "select";
    case "url-test":
      return "url-test";
    case "fallback":
      return "fallback";
    case "load-balance":
      return "load-balance";
    default:
      return "unknown";
  }
}
