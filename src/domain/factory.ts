import type { ConfigIR } from "./types";

export function createEmptyConfigIR(): ConfigIR {
  return {
    general: {},
    proxies: [],
    policyGroups: [],
    rules: [],
    remoteResources: [],
    metadata: {
      ignoredTopLevelSections: []
    }
  };
}
