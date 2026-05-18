import type { ConfigIR } from "../domain/types";
import { WarningCollector } from "../utils/warnings";

function buildLines(title: string, lines: string[], prefix: string): string[] {
  if (lines.length === 0) {
    return [];
  }

  return [
    `${prefix} ${title}`,
    ...lines.map((line) => `${prefix} ${line}`),
    `${prefix} End ${title}`
  ];
}

export function collectIgnoredSectionWarnings(ir: ConfigIR, warnings: WarningCollector): void {
  const ignored = ir.metadata.ignoredSections;
  if (!ignored) {
    return;
  }

  if (ignored.rewrite && ignored.rewrite.length > 0) {
    warnings.add("dropped", `未转换 rewrite 项 ${ignored.rewrite.length} 条，已在输出注释中保留`);
  }
  if (ignored.task && ignored.task.length > 0) {
    warnings.add("dropped", `未转换 task 项 ${ignored.task.length} 条，已在输出注释中保留`);
  }
  if (ignored.mitm && ignored.mitm.length > 0) {
    warnings.add("dropped", `未转换 mitm 项 ${ignored.mitm.length} 条，已在输出注释中保留`);
  }
  if (ignored.serverRemote && ignored.serverRemote.length > 0) {
    warnings.add("info", `未启用 server_remote 订阅 ${ignored.serverRemote.length} 条，已在输出注释中保留`);
  }
  if (ignored.filterRemote && ignored.filterRemote.length > 0) {
    warnings.add("info", `未启用 filter_remote 订阅 ${ignored.filterRemote.length} 条，已在输出注释中保留`);
  }
}

export function renderIgnoredSectionsAsComments(
  ir: ConfigIR,
  flavor: "yaml" | "ini"
): string {
  const ignored = ir.metadata.ignoredSections;
  if (!ignored) {
    return "";
  }

  const prefix = flavor === "yaml" ? "#" : ";";
  const lines = [
    ...buildLines("Preserved Disabled Server Remote Entries", ignored.serverRemote ?? [], prefix),
    ...buildLines("Preserved Disabled Filter Remote Entries", ignored.filterRemote ?? [], prefix),
    ...buildLines("Ignored Rewrite Entries", ignored.rewrite ?? [], prefix),
    ...buildLines("Ignored Task Entries", ignored.task ?? [], prefix),
    ...buildLines("Ignored MITM Entries", ignored.mitm ?? [], prefix)
  ];

  return lines.length > 0 ? `\n\n${lines.join("\n")}` : "";
}
