import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { transformConfig } from "../src/app";
import { generateConfig } from "../src/generators";
import { parseConfig } from "../src/parsers";
import { detectFormat } from "../src/parsers/format-detector";
import { integrateRemoteResources } from "../src/remote/integrator";
import { validateOutput } from "../src/validators/output";

function loadFixture(name: string) {
  return readFileSync(resolve(__dirname, "fixtures", name), "utf8");
}

describe("format detection", () => {
  test("detects qx, surge and clash samples", () => {
    expect(detectFormat(loadFixture("qx.conf")).format).toBe("qx");
    expect(detectFormat(loadFixture("surge.conf")).format).toBe("surge");
    expect(detectFormat(loadFixture("clash.yaml")).format).toBe("clash");
    expect(detectFormat(loadFixture("complex-clash.yaml")).format).toBe("clash");
  });
});

describe("conversion matrix", () => {
  const cases = [
    ["qx.conf", "qx", "surge"],
    ["qx.conf", "qx", "clash"],
    ["surge.conf", "surge", "qx"],
    ["surge.conf", "surge", "clash"],
    ["clash.yaml", "clash", "qx"],
    ["clash.yaml", "clash", "surge"]
  ] as const;

  test.each(cases)("converts %s from %s to %s", (fixture, source, target) => {
    const parsed = parseConfig(loadFixture(fixture), source);
    expect(parsed.data.proxies.length).toBeGreaterThan(0);
    expect(parsed.data.policyGroups.length).toBeGreaterThan(0);
    expect(parsed.data.rules.length).toBeGreaterThan(0);

    const generated = generateConfig(parsed.data, target);
    expect(generated.content.length).toBeGreaterThan(0);
    expect(validateOutput(target, generated.content).valid).toBe(true);
  });
});

describe("terminal rule semantics", () => {
  test("preserves FINAL target from qx", () => {
    const parsed = parseConfig(loadFixture("qx.conf"), "qx");
    expect(parsed.data.rules.at(-1)?.type).toBe("FINAL");
    expect(parsed.data.rules.at(-1)?.target).toBe("Proxy");
  });

  test("preserves FINAL target from surge", () => {
    const parsed = parseConfig(loadFixture("surge.conf"), "surge");
    expect(parsed.data.rules.at(-1)?.type).toBe("FINAL");
    expect(parsed.data.rules.at(-1)?.target).toBe("Proxy");
  });
});

describe("provider and protocol preservation", () => {
  test("maps clash provider use to qx policy-path", () => {
    const parsed = parseConfig(loadFixture("complex-clash.yaml"), "clash");
    const generated = generateConfig(parsed.data, "qx");
    expect(generated.content).toContain("policy-path=https://example.com/providers/air.yaml");
  });

  test("preserves qx remote proxy subscriptions in qx output", () => {
    const source = `${loadFixture("qx.conf")}\n\n[server_remote]\nhttps://example.com/providers/proxies.txt, tag=RemoteNodes, enabled=true`;
    const parsed = parseConfig(source, "qx");
    const generated = generateConfig(parsed.data, "qx");
    expect(generated.content).toContain("[server_remote]");
    expect(generated.content).toContain("tag=RemoteNodes");
  });

  test("preserves common advanced proxy fields into surge output", () => {
    const parsed = parseConfig(loadFixture("complex-clash.yaml"), "clash");
    const generated = generateConfig(parsed.data, "surge");
    expect(generated.content).toContain("uuid=123e4567-e89b-12d3-a456-426614174000");
    expect(generated.content).toContain("obfs=ws");
    expect(generated.content).toContain("udp-relay=true");
  });
});

describe("remote resource integration", () => {
  test("merges remote rule payload into ir", () => {
    const parsed = parseConfig(loadFixture("clash.yaml"), "clash");
    const integrated = integrateRemoteResources(
      parsed.data,
      [{ url: "https://example.com/rules.yaml", kind: "rule-provider", owner: "ruleset" }],
      [{ url: "https://example.com/rules.yaml", ok: true, content: loadFixture("remote-rules.yaml") }],
      "surge",
      { expandRemoteRules: false, expandRemoteProxies: false }
    );

    expect(integrated.ir.rules.some((rule) => rule.value === "github.com")).toBe(true);
  });

  test("keeps remote proxy subscriptions compact by default", async () => {
    const parsed = parseConfig(loadFixture("complex-clash.yaml"), "clash");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("providers/air.yaml")) {
        return new Response(
          `proxies:\n  - name: Remote-HK\n    type: ss\n    server: remote.hk.example.com\n    port: 443\n    cipher: aes-128-gcm\n    password: pass123\n`,
          {
            status: 200,
            headers: { "content-type": "text/plain" }
          }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await transformConfig(loadFixture("complex-clash.yaml"), {
        sourceFormat: "clash",
        targetFormat: "surge",
        expandRemoteRules: false,
        expandRemoteProxies: false
      });

      expect(result.output?.content).not.toContain("policy-path=https://example.com/providers/air.yaml");
      expect(result.output?.content).toContain("Remote-HK = ss, remote.hk.example.com, 443");
      expect(result.output?.content).toContain("Auto = url-test, Remote-HK, url=http://www.gstatic.com/generate_204, interval=300");
      expect(result.output?.content).not.toContain("proxy-providers:");
      expect(result.output?.content.length).toBeLessThan(50000);
      expect(parsed.data.remoteResources.some((item) => item.kind === "proxy-provider")).toBe(true);
      expect(result.output?.warnings.some((item) => item.message.includes("远程节点订阅已自动并入本地"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("auto-inlines surge-incompatible remote resources", async () => {
    const input = loadFixture("qx.conf");
    const result = await transformConfig(input, {
      sourceFormat: "qx",
      targetFormat: "surge",
      expandRemoteRules: false,
      expandRemoteProxies: false
    });

    expect(result.output?.content).toContain("[Proxy Group]");
    expect(result.output?.content).not.toContain("proxy-providers:");
    expect(result.output?.content).toContain("HK-SS = ss, hk.example.com, 443");
  });

  test("transformConfig expands remote resources through fetch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(loadFixture("remote-rules.yaml"), {
        status: 200,
        headers: { "content-type": "text/plain" }
      })) as typeof fetch;

    const source = `${loadFixture("clash.yaml")}\nrule-providers:\n  extra:\n    type: http\n    url: https://example.com/rules.yaml\n    interval: 3600\n    path: ./rules/extra.yaml\n`;

    try {
    const result = await transformConfig(source, {
      targetFormat: "surge",
      expandRemoteRules: true,
      expandRemoteProxies: false
    });
      expect(result.output?.content).toContain("DOMAIN-SUFFIX, github.com, Proxy");
      expect(result.output?.warnings.some((item) => item.message.includes("已并入远程资源") || item.message.includes("自动展开到本地") || item.message.includes("远程节点订阅已自动并入本地"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
