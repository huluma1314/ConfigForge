import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  adminViewMeta,
  buildRunAvailabilitySummary,
  buildRunMetricItems,
  buildRunTrendRows,
  formatProtocolSummary,
  formatDeliveryText,
  formatDateTime,
  formatSourceLastCount,
  groupUsersByLabel,
  isCollapsedUserGroup,
  isAdminSectionVisible,
  normalizeAdminView,
  rankUsersByRange,
  removeUsersByTokens,
  shouldRefreshUsersOnResume,
  sourceKindLabel,
  sourcePoolLabel,
  summarizeUserGroup,
  toggleVisibleSelection,
  visibleSelectionState,
} from "../src/sub-store-admin/admin-ui.mjs";

test("formats both subscription links as one delivery message", () => {
  assert.equal(
    formatDeliveryText(makeUser()),
    [
      "base64订阅链接：https://sub.huluma.dpdns.org/base64?token=token_value_1234567890",
      "clash订阅链接：https://sub.huluma.dpdns.org/clash-best?token=token_value_1234567890",
    ].join("\n"),
  );
});

test("admin create flow displays and copies the complete two-link delivery text", async () => {
  const html = await readFile(new URL("../src/sub-store-admin/admin.html", import.meta.url), "utf8");

  assert.match(html, /<textarea id="addResultLink"[^>]*rows="6"[^>]*readonly/);
  assert.match(html, /复制两个链接/);
  assert.match(html, /addResultLink\.value = formatDeliveryText\(user\)/);
  assert.match(html, /await copyText\(formatDeliveryText\(latestCreatedUser\)\)/);
  assert.match(html, /await copyText\(formatDeliveryText\(data\)\)/);
});

function makeUser(overrides = {}) {
  return {
    label: "user",
    token: "token_value_1234567890",
    subscription: "https://sub.huluma.dpdns.org/base64?token=token_value_1234567890",
    status: "active",
    createdAt: "2026-06-10T00:00:00.000Z",
    stats: {
      requestCount: 0,
      bytesServed: 0,
      lastIp: "",
      lastSeenAt: "",
      lastPath: "",
      hourlyRequests: [],
    },
    ...overrides,
  };
}

test("keeps sub-store user and source pages separate", () => {
  assert.equal(normalizeAdminView("sources"), "sources");
  assert.equal(normalizeAdminView("#sources"), "sources");
  assert.equal(normalizeAdminView("runs"), "runs");
  assert.equal(normalizeAdminView("#runs"), "runs");
  assert.equal(normalizeAdminView("users"), "users");
  assert.equal(normalizeAdminView("anything"), "users");
  assert.equal(isAdminSectionVisible("users", "users"), true);
  assert.equal(isAdminSectionVisible("sources", "users"), false);
  assert.equal(isAdminSectionVisible("sources", "sources"), true);
  assert.equal(isAdminSectionVisible("users", "sources"), false);
  assert.equal(isAdminSectionVisible("runs", "runs"), true);
  assert.deepEqual(adminViewMeta("sources"), {
    hash: "#sources",
    title: "订阅源管理",
    note: "管理抓取来源 · 查看执行链路",
  });
  assert.deepEqual(adminViewMeta("runs"), {
    hash: "#runs",
    title: "运行看板",
    note: "按天查看抓取、过滤与节点变化",
  });
});

test("formats migrated subscription source labels and summaries", () => {
  assert.equal(sourcePoolLabel("public"), "公共池");
  assert.equal(sourcePoolLabel("wuhusihai"), "五湖四海私有池");
  assert.equal(sourceKindLabel("manual"), "手动源");
  assert.equal(sourceKindLabel("telegram"), "TG 频道");
  assert.equal(formatSourceLastCount(12), "12 个");
  assert.equal(formatSourceLastCount(null), "-");
  assert.equal(formatProtocolSummary({ vless: 2, trojan: 1 }), "trojan ×1, vless ×2");
  assert.equal(formatProtocolSummary({}), "-");
});

test("admin sources page sends all manual nodes through their pool's Clash Verge test", async () => {
  const html = await readFile(new URL("../src/sub-store-admin/admin.html", import.meta.url), "utf8");

  assert.match(html, /id="manualNodeForm"/);
  assert.match(html, /id="manualNodeUriInput"/);
  assert.match(html, /\/api\/manual-nodes/);
  assert.match(html, /订阅链接会进入测速过滤/);
  assert.match(html, /进入所属池后由 Clash Verge 实测/);
  assert.doesNotMatch(html, /单节点免测保留/);
});

test("labels public Alma metrics with the Verge-first pipeline stages", () => {
  const metrics = buildRunMetricItems({
    pool: "public",
    filter: {
      rawCount: 5780,
      parsedCount: 5578,
      strictPassedCount: 222,
      exportedCount: 150,
      durationSeconds: 305,
    },
  });

  assert.deepEqual(metrics.map((item) => [item.label, item.value]), [
    ["公共原始", 5780],
    ["可解析", 5578],
    ["Verge 实时响应", 222],
    ["最终导出", 150],
    ["耗时", "305s"],
  ]);
});

test("labels wuhusihai Alma metrics separately from the public pool", () => {
  const metrics = buildRunMetricItems({
    pool: "wuhusihai",
    filter: {
      rawCount: 261,
      parsedCount: 84,
      strictPassedCount: 2,
      exportedCount: 2,
      durationSeconds: 19,
    },
  });

  assert.deepEqual(metrics.map((item) => [item.label, item.value]), [
    ["180 天原始历史", 261],
    ["可解析", 84],
    ["Verge 实时响应", 2],
    ["私有导出", 2],
    ["耗时", "19s"],
  ]);
});

test("normalizes Verge strict trend rows and current availability slices", () => {
  assert.deepEqual(
    buildRunTrendRows({
      trend: [
        { date: "2026-07-09", rawCount: 1000, parsedCount: 900, strictPassedCount: 100, exportedCount: 90 },
        { date: "2026-07-10", rawCount: 5780, parsedCount: 5578, strictPassedCount: 222, exportedCount: 150 },
      ],
    }),
    [
      { date: "2026-07-09", rawCount: 1000, parsedCount: 900, strictPassedCount: 100, exportedCount: 90, strictRatio: 10 },
      { date: "2026-07-10", rawCount: 5780, parsedCount: 5578, strictPassedCount: 222, exportedCount: 150, strictRatio: 3.8 },
    ],
  );

  assert.deepEqual(
    buildRunAvailabilitySummary({
      filter: { rawCount: 5780, strictPassedCount: 222 },
    }),
    {
      total: 5780,
      available: 222,
      unavailable: 5558,
      usableRatio: 3.8,
    },
  );
});

test("keeps migrated user bulk selection helpers working", () => {
  const users = [
    makeUser({ label: "alpha", token: "alpha_token_123456" }),
    makeUser({ label: "beta", token: "beta_token_123456" }),
    makeUser({ label: "gamma", token: "gamma_token_123456" }),
  ];

  const selected = toggleVisibleSelection(users.slice(0, 2), new Set(["hidden_token_123456"]), true);
  assert.deepEqual(visibleSelectionState(users.slice(0, 2), selected), {
    totalCount: 2,
    selectedCount: 2,
    allSelected: true,
    someSelected: false,
  });
  assert.deepEqual(removeUsersByTokens(users, ["alpha_token_123456"]).map((user) => user.label), ["beta", "gamma"]);
});

test("groups users by filled remark and keeps created time displayable", () => {
  const users = [
    makeUser({ label: "张三", token: "alpha_token_123456", createdAt: "2026-06-14T01:02:03.000Z" }),
    makeUser({ label: "李四", token: "beta_token_123456" }),
    makeUser({ label: "张三", token: "gamma_token_123456" }),
    makeUser({ label: "", token: "empty_token_123456", createdAt: "" }),
  ];

  const groups = groupUsersByLabel(users);

  assert.deepEqual(groups.map((group) => [group.label, group.users.map((user) => user.token)]), [
    ["张三", ["alpha_token_123456", "gamma_token_123456"]],
    ["李四", ["beta_token_123456"]],
    ["未命名", ["empty_token_123456"]],
  ]);
  assert.equal(formatDateTime(users[0].createdAt), "2026-06-14 09:02");
  assert.equal(
    summarizeUserGroup(groups[2]),
    "1 个 token · 可用 1 · 请求 0 · 最近 - · 添加 -",
  );
});

test("keeps user groups expanded by default on narrow screens", () => {
  const group = { label: "张三", users: [makeUser({ label: "张三" })] };

  assert.equal(isCollapsedUserGroup(group, new Set()), false);
  assert.equal(isCollapsedUserGroup(group, new Set(["张三"])), true);
});

test("refreshes cloud users when the user page resumes after going stale", () => {
  assert.equal(shouldRefreshUsersOnResume({
    activeView: "users",
    usersLoaded: true,
    lastSyncedAt: 1_000,
    now: 32_000,
  }), true);
  assert.equal(shouldRefreshUsersOnResume({
    activeView: "sources",
    usersLoaded: true,
    lastSyncedAt: 1_000,
    now: 32_000,
  }), false);
  assert.equal(shouldRefreshUsersOnResume({
    activeView: "users",
    usersLoaded: false,
    lastSyncedAt: 1_000,
    now: 32_000,
  }), false);
  assert.equal(shouldRefreshUsersOnResume({
    activeView: "users",
    usersLoaded: true,
    lastSyncedAt: 30_000,
    now: 32_000,
  }), false);
});

test("ranks users by selectable time ranges", () => {
  const now = new Date("2026-06-17T12:00:00+08:00");
  const users = [
    makeUser({
      label: "alpha",
      token: "alpha_token_123456",
      stats: {
        dailyStats: [
          { day: "2026-06-17", requests: 5, bytesServed: 1000 },
          { day: "2026-06-16", requests: 7, bytesServed: 3000 },
          { day: "2026-06-10", requests: 20, bytesServed: 9000 },
          { day: "2026-05-31", requests: 40, bytesServed: 5000 },
        ],
      },
    }),
    makeUser({
      label: "beta",
      token: "beta_token_123456",
      stats: {
        dailyStats: [
          { day: "2026-06-17", requests: 10, bytesServed: 500 },
          { day: "2026-06-09", requests: 1, bytesServed: 10000 },
        ],
      },
    }),
  ];

  assert.deepEqual(rankUsersByRange(users, "requestCount", "today", now).map((item) => [item.user.label, item.value]), [
    ["beta", 10],
    ["alpha", 5],
  ]);
  assert.deepEqual(rankUsersByRange(users, "requestCount", "thisWeek", now).map((item) => [item.user.label, item.value]), [
    ["alpha", 12],
    ["beta", 10],
  ]);
  assert.deepEqual(rankUsersByRange(users, "bytesServed", "lastWeek", now).map((item) => [item.user.label, item.value]), [
    ["beta", 10000],
    ["alpha", 9000],
  ]);
  assert.deepEqual(rankUsersByRange(users, "requestCount", "lastMonth", now).map((item) => [item.user.label, item.value]), [
    ["alpha", 40],
    ["beta", 0],
  ]);
});

test("uses hourly request history as a legacy fallback for range ranks", () => {
  const now = new Date("2026-06-17T12:00:00+08:00");
  const users = [
    makeUser({
      label: "legacy",
      token: "legacy_token_123456",
      stats: {
        requestCount: 10,
        bytesServed: 2000,
        hourlyRequests: [
          { hour: "2026-06-16T15:00Z", requests: 2 },
          { hour: "2026-06-17T00:00Z", requests: 3 },
        ],
      },
    }),
  ];

  assert.deepEqual(rankUsersByRange(users, "requestCount", "today", now).map((item) => [item.user.label, item.value]), [
    ["legacy", 3],
  ]);
  assert.deepEqual(rankUsersByRange(users, "bytesServed", "today", now).map((item) => [item.user.label, item.value]), [
    ["legacy", 600],
  ]);
});

test("renders mobile-friendly source cards outside the horizontally scrolling table", async () => {
  const html = await readFile(new URL("../src/sub-store-admin/admin.html", import.meta.url), "utf8");

  assert.match(html, /id="sourceCardWrap"/);
  assert.match(html, /\.source-card/);
  assert.match(html, /renderSourceCard/);
});

test("keeps the Alma run dashboard focused on counts instead of node previews", async () => {
  const html = await readFile(new URL("../src/sub-store-admin/admin.html", import.meta.url), "utf8");

  assert.match(html, /buildRunMetricItems/);
  assert.match(html, /id="runAliveTrendChart"/);
  assert.match(html, /id="runTotalTrendChart"/);
  assert.match(html, /id="runAvailabilityPie"/);
  assert.match(html, /id="runChartTooltip"/);
  assert.match(html, /showRunChartTooltip/);
  assert.match(html, /run-chart-hit-area/);
  assert.match(html, /data-tooltip-title/);
  assert.match(html, /Verge 严格通过走势/);
  assert.match(html, /最终导出走势/);
  assert.match(html, /Verge 严格通过占比/);
  assert.match(html, /抓到节点/);
  assert.match(html, /扫描消息/);
  assert.match(html, /发现订阅 URL/);
  assert.match(html, /有效订阅 URL/);
  assert.match(html, /严格通过 \/ 总数/);
  assert.match(html, /通过率/);
  assert.match(html, /id="runPoolSelect"/);
  assert.doesNotMatch(html, /<span class="th-label">直连<\/span>/);
  assert.doesNotMatch(html, /<span class="th-label">代理<\/span>/);
  assert.doesNotMatch(html, /<span class="th-label">免测<\/span>/);
  assert.doesNotMatch(html, /节点预览/);
  assert.doesNotMatch(html, /过滤可用/);
  assert.doesNotMatch(html, /可信免测/);
  assert.doesNotMatch(html, /默认订阅/);
  assert.doesNotMatch(html, /runPreviewList/);
  assert.doesNotMatch(html, /run-preview/);
});

test("wires user page resume events to cloud refresh", async () => {
  const html = await readFile(new URL("../src/sub-store-admin/admin.html", import.meta.url), "utf8");

  assert.match(html, /visibilitychange/);
  assert.match(html, /window\.addEventListener\('focus'/);
  assert.match(html, /lastUsersSyncedAt/);
});
