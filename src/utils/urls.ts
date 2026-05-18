export function deriveResourceOwnerFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const lastSegment = pathname.split("/").filter(Boolean).at(-1) ?? url;
    return lastSegment.replace(/\.(list|yaml|yml|conf|txt|sgmodule)$/i, "");
  } catch {
    const cleaned = url.replace(/\/+$/, "");
    const lastSegment = cleaned.split("/").filter(Boolean).at(-1) ?? cleaned;
    return lastSegment.replace(/\.(list|yaml|yml|conf|txt|sgmodule)$/i, "");
  }
}
