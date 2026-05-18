export function normalizeInput(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
}

export function splitLines(text: string): string[] {
  return normalizeInput(text)
    .split("\n")
    .map((line) => line.trimEnd());
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCsvSegments(value: string): string[] {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseKeyValueSegments(value: string): Record<string, string> {
  const entries = parseCsvSegments(value);
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const [rawKey, ...rest] = entry.split("=");
    if (!rawKey || rest.length === 0) {
      continue;
    }
    result[rawKey.trim()] = rest.join("=").trim();
  }

  return result;
}

export function formatIniSection(title: string, lines: string[]): string {
  return [`[${title}]`, ...lines, ""].join("\n");
}
