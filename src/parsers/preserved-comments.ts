import type { ProxyNode } from "../domain/types";
import { parseNamedProxyLine, parseServerLocalLine } from "./common";
import { splitLines } from "../utils/text";

function collectBlockLines(input: string, startMarker: string, endMarker: string): string[] {
  const lines = splitLines(input);
  const collected: string[] = [];
  let active = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const normalized = line.replace(/^[;#]\s*/, "");
    if (normalized === startMarker) {
      active = true;
      continue;
    }
    if (normalized === endMarker) {
      active = false;
      continue;
    }
    if (!active) {
      continue;
    }
    if (!line.startsWith(";") && !line.startsWith("#")) {
      continue;
    }
    collected.push(normalized);
  }

  return collected;
}

function parsePreservedProxyLine(line: string): ProxyNode | undefined {
  const content = line.trim();
  if (!content.includes("=")) {
    return undefined;
  }

  const parsedServerLocal = parseServerLocalLine(content);
  if (parsedServerLocal) {
    return parsedServerLocal;
  }

  const parsedNamed = parseNamedProxyLine(content);
  if (parsedNamed) {
    return parsedNamed;
  }

  return undefined;
}

export function extractPreservedUnsupportedSurgeProxies(input: string): ProxyNode[] {
  const blockLines = collectBlockLines(
    input,
    "Surge Unsupported Proxies",
    "End Surge Unsupported Proxies"
  );

  return blockLines
    .filter((line) => !line.includes("Surge 不支持"))
    .map(parsePreservedProxyLine)
    .filter((item): item is ProxyNode => Boolean(item));
}
