import type { RemoteResource } from "../domain/types";

export interface RemoteFetchResult {
  url: string;
  ok: boolean;
  content?: string;
  error?: string;
}

export async function fetchRemoteResources(resources: RemoteResource[]): Promise<RemoteFetchResult[]> {
  const timeoutByKind: Record<RemoteResource["kind"], number> = {
    "proxy-provider": 10000,
    "rule-provider": 10000,
    "policy-path": 5000,
    "rule-template": 5000,
    unknown: 5000
  };

  const tasks = resources.map(async (resource) => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutByKind[resource.kind] ?? 5000);

    try {
      const response = await fetch(resource.url, { signal: controller.signal });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        return { url: resource.url, ok: false, error: `HTTP ${response.status}` };
      }
      if (/text\/html/i.test(contentType)) {
        return { url: resource.url, ok: false, error: "返回了 HTML 内容，疑似错误页或被 CORS 拦截" };
      }
      return {
        url: resource.url,
        ok: true,
        content: await response.text()
      };
    } catch (error) {
      return {
        url: resource.url,
        ok: false,
        error: error instanceof Error ? error.message : "远程拉取失败"
      };
    } finally {
      globalThis.clearTimeout(timer);
    }
  });

  return Promise.all(tasks);
}
