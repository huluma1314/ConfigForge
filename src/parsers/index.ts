import type { ConfigFormat, ParseResult } from "../domain/types";
import type { ConfigIR } from "../domain/types";
import { parseClash } from "./clash";
import { detectFormat } from "./format-detector";
import { parseQX } from "./qx";
import { parseSurge } from "./surge";

export function parseConfig(input: string, format?: ConfigFormat): ParseResult<ConfigIR> {
  const resolvedFormat = format ?? detectFormat(input).format;

  if (!resolvedFormat) {
    throw new Error("无法自动识别配置格式，请手动选择源格式。");
  }

  switch (resolvedFormat) {
    case "qx":
      return parseQX(input);
    case "surge":
      return parseSurge(input);
    case "clash":
      return parseClash(input);
  }
}
