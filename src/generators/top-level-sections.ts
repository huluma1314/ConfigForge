import type { ConfigIR } from "../domain/types";
import { WarningCollector } from "../utils/warnings";

export function collectTopLevelSectionWarnings(ir: ConfigIR, warnings: WarningCollector): void {
  const ignored = ir.metadata.ignoredTopLevelSections ?? [];
  if (ignored.length > 0) {
    warnings.add("info", `Clash 顶层原生段已保留为注释: ${ignored.join(", ")}`);
  }
}

export function renderTopLevelSectionsAsComments(ir: ConfigIR, prefix: string): string {
  const ignored = ir.metadata.ignoredTopLevelSections ?? [];
  if (ignored.length === 0) {
    return "";
  }
  return `\n\n${prefix} Clash Top-Level Sections Preserved\n${ignored.map((item) => `${prefix} ${item}`).join("\n")}\n${prefix} End Clash Top-Level Sections Preserved`;
}
