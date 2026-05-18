import { describe, expect, test } from "vitest";
import { transformSubscription } from "../src/subscription";

const uriList = [
  "trojan://secret@example.com:443?sni=cdn.example.com#Trojan-Test",
  "vless://123e4567-e89b-12d3-a456-426614174000@example.net:443?security=tls&type=ws&path=%2Fsocket&host=cdn.example.net#Vless-Test"
].join("\n");

function encodeBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

describe("subscription transform", () => {
  test("converts base64 URI subscription to clash proxy file", async () => {
    const result = await transformSubscription(encodeBase64(uriList), {
      inputMode: "text",
      targetFormat: "clash"
    });

    expect(result.proxies).toHaveLength(2);
    expect(result.content).toContain("proxies:");
    expect(result.content).toContain("Trojan-Test");
    expect(result.content).toContain("Vless-Test");
  });

  test("converts URI subscription to surge proxy file", async () => {
    const result = await transformSubscription(uriList, {
      inputMode: "text",
      targetFormat: "surge"
    });

    expect(result.proxies).toHaveLength(2);
    expect(result.content).toContain("[Proxy]");
    expect(result.content).toContain("Trojan-Test = trojan");
    expect(result.content).toContain("; Vless-Test");
  });

  test("exports base64 URI subscription", async () => {
    const result = await transformSubscription(uriList, {
      inputMode: "text",
      targetFormat: "base64-uri"
    });

    expect(result.content).toBe(encodeBase64(uriList));
    expect(result.fileName).toBe("configforge-subscription-base64.txt");
  });

  test("fetches subscription url with fallback proxy entry", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      const url = String(input);
      if (url.startsWith("https://r.jina.ai/")) {
        return new Response(uriList, {
          status: 200,
          headers: { "content-type": "text/plain" }
        });
      }
      return new Response("Forbidden", { status: 403 });
    }) as typeof fetch;

    try {
      const result = await transformSubscription("https://example.com/sub", {
        inputMode: "url",
        targetFormat: "surge"
      });

      expect(result.proxies).toHaveLength(2);
      expect(calls).toBeGreaterThan(1);
      expect(result.log.some((line) => line.includes("已使用代理入口拉取"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("unwraps r.jina.ai markdown wrapper before parsing", async () => {
    const wrapped = [
      "Title: ",
      "",
      "URL Source: https://example.com/sub",
      "",
      "Markdown Content:",
      encodeBase64(uriList)
    ].join("\n");

    const result = await transformSubscription(wrapped, {
      inputMode: "text",
      targetFormat: "surge"
    });

    expect(result.proxies).toHaveLength(2);
    expect(result.content).not.toContain("URL Source");
    expect(result.content).toContain("Trojan-Test = trojan");
  });

  test("generates subconverter-style subscription link", async () => {
    const result = await transformSubscription("https://example.com/sub", {
      inputMode: "url",
      targetFormat: "surge",
      outputMode: "link"
    });

    expect(result.content).toContain("https://api.wcc.best/sub?");
    expect(result.content).toContain("target=surge");
    expect(result.content).toContain("url=https%3A%2F%2Fexample.com%2Fsub");
    expect(result.proxies).toHaveLength(0);
  });
});
