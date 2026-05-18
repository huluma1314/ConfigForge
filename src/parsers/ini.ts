import { splitLines } from "../utils/text";

export interface IniSection {
  name: string;
  entries: Array<{ line: number; content: string }>;
}

export function parseIniSections(text: string): IniSection[] {
  const lines = splitLines(text);
  const sections: IniSection[] = [];
  let current: IniSection | undefined;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line || line.startsWith(";") || line.startsWith("#")) {
      return;
    }

    const match = line.match(/^\[(.+)]$/);
    if (match) {
      current = { name: match[1].trim(), entries: [] };
      sections.push(current);
      return;
    }

    if (!current) {
      current = { name: "__root__", entries: [] };
      sections.push(current);
    }

    current.entries.push({ line: lineNumber, content: line });
  });

  return sections;
}
