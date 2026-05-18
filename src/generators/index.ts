import type { ConfigFormat, ConfigIR } from "../domain/types";
import { generateClash } from "./clash";
import { generateQX } from "./qx";
import { generateSurge } from "./surge";

export function generateConfig(ir: ConfigIR, format: ConfigFormat) {
  switch (format) {
    case "qx":
      return generateQX(ir);
    case "surge":
      return generateSurge(ir);
    case "clash":
      return generateClash(ir);
  }
}
