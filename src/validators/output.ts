import yaml from "js-yaml";
import type { ConfigFormat, ValidationResult } from "../domain/types";
import { parseIniSections } from "../parsers/ini";

export function validateOutput(format: ConfigFormat, content: string): ValidationResult {
  try {
    if (format === "clash") {
      yaml.load(content);
      return { valid: true, errors: [] };
    }

    const sections = parseIniSections(content);
    if (sections.length === 0) {
      return { valid: false, errors: [{ message: "INI 输出为空" }] };
    }

    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [{ message: error instanceof Error ? error.message : "输出校验失败" }]
    };
  }
}
