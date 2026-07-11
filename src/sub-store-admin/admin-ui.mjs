function statsOf(user = {}) {
  return user.stats || {};
}

function stringValue(value) {
  return String(value || '').toLowerCase();
}

function compareValues(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function userDisplayLabel(user = {}) {
  return String(user.label || '').trim() || '未命名';
}

export function formatDeliveryText(user = {}) {
  const existing = String(user.deliveryText || '').trim();
  if (existing) {
    return existing;
  }

  const token = String(user.token || '').trim();
  const base64Subscription = String(
    user.base64Subscription
    || user.subscription
    || (token ? `https://sub.huluma.dpdns.org/base64?token=${token}` : ''),
  ).trim();
  const clashSubscription = String(
    user.clashSubscription
    || (token ? `https://sub.huluma.dpdns.org/clash-best?token=${token}` : ''),
  ).trim();

  return [
    `base64订阅链接：${base64Subscription}`,
    `clash订阅链接：${clashSubscription}`,
  ].join('\n');
}

export function groupUsersByLabel(users = []) {
  const groups = [];
  const byLabel = new Map();

  for (const user of users) {
    const label = userDisplayLabel(user);
    let group = byLabel.get(label);
    if (!group) {
      group = { label, users: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.users.push(user);
  }

  return groups;
}

export function isCollapsedUserGroup(group = {}, collapsedLabels = new Set()) {
  const labels = collapsedLabels instanceof Set ? collapsedLabels : new Set(collapsedLabels || []);
  const label = String(group.label || '未命名').trim() || '未命名';
  return labels.has(label);
}

export function toggleCollapsedUserGroup(group = {}, collapsedLabels = new Set()) {
  const labels = collapsedLabels instanceof Set ? new Set(collapsedLabels) : new Set(collapsedLabels || []);
  const label = String(group.label || '未命名').trim() || '未命名';
  if (labels.has(label)) {
    labels.delete(label);
  } else {
    labels.add(label);
  }
  return labels;
}

function timestampFrom(value) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function newestTimestamp(values = []) {
  return values
    .map(timestampFrom)
    .reduce((max, value) => Math.max(max, value), 0);
}

function oldestTimestamp(values = []) {
  return values
    .map(timestampFrom)
    .filter(Boolean)
    .reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
}

export function summarizeUserGroup(group = {}) {
  const users = Array.isArray(group.users) ? group.users : [];
  const activeCount = users.filter((user) => user.status !== 'disabled').length;
  const requestCount = users.reduce((sum, user) => sum + Number(statsOf(user).requestCount || 0), 0);
  const lastSeenTime = newestTimestamp(users.map((user) => statsOf(user).lastSeenAt));
  const firstCreatedTime = oldestTimestamp(users.map((user) => user.createdAt));
  const lastSeen = lastSeenTime ? formatDateTime(new Date(lastSeenTime).toISOString()) : '-';
  const firstCreated = Number.isFinite(firstCreatedTime) ? formatDateTime(new Date(firstCreatedTime).toISOString()) : '-';
  return `${users.length} 个 token · 可用 ${activeCount} · 请求 ${requestCount} · 最近 ${lastSeen} · 添加 ${firstCreated}`;
}

export function normalizeAdminView(value) {
  const view = String(value || '').replace(/^#/, '');
  if (view === 'sources' || view === 'runs') {
    return view;
  }
  return 'users';
}

export function adminViewMeta(value) {
  const view = normalizeAdminView(value);
  if (view === 'sources') {
    return {
      hash: '#sources',
      title: '订阅源管理',
      note: '管理抓取来源 · 查看执行链路',
    };
  }
  if (view === 'runs') {
    return {
      hash: '#runs',
      title: '运行看板',
      note: '按天查看抓取、过滤与节点变化',
    };
  }
  return {
    hash: '#users',
    title: '用户管理',
    note: '管理个人 token · 查看请求与下发统计',
  };
}

export function isAdminSectionVisible(sectionView, activeView) {
  return normalizeAdminView(sectionView) === normalizeAdminView(activeView);
}

function finiteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function buildRunMetricItems(current = {}) {
  const pool = current.pool === 'wuhusihai' ? 'wuhusihai' : 'public';
  const durationSeconds = finiteNumberOrNull(current.filter?.durationSeconds);

  return [
    { label: pool === 'wuhusihai' ? '180 天原始历史' : '公共原始', value: current.filter?.rawCount },
    { label: '可解析', value: current.filter?.parsedCount },
    { label: 'Verge 实时响应', value: current.filter?.strictPassedCount },
    { label: pool === 'wuhusihai' ? '私有导出' : '最终导出', value: current.filter?.exportedCount },
    { label: '耗时', value: durationSeconds === null ? null : `${durationSeconds}s` },
  ];
}

export function buildRunTrendRows(dashboard = {}) {
  const rows = Array.isArray(dashboard.trend) ? dashboard.trend : [];
  return rows
    .filter((row) => row && row.date)
    .map((row) => {
      const rawCount = finiteNumberOrNull(row.rawCount) ?? 0;
      const parsedCount = finiteNumberOrNull(row.parsedCount);
      const strictPassedCount = finiteNumberOrNull(row.strictPassedCount);
      const exportedCount = finiteNumberOrNull(row.exportedCount);
      const strictRatio = rawCount > 0 && strictPassedCount !== null
        ? roundOne((strictPassedCount / rawCount) * 100)
        : finiteNumberOrNull(row.strictRatio);
      return {
        date: String(row.date),
        rawCount,
        parsedCount,
        strictPassedCount,
        exportedCount,
        strictRatio,
      };
    });
}

export function buildRunAvailabilitySummary(current = {}) {
  const total = finiteNumberOrNull(current.filter?.rawCount) ?? 0;
  const available = finiteNumberOrNull(current.filter?.strictPassedCount);
  const unavailable = available === null ? null : Math.max(total - available, 0);
  const usableRatio = total > 0 && available !== null
    ? roundOne((available / total) * 100)
    : null;
  return {
    total,
    available,
    unavailable,
    usableRatio,
  };
}

export function shouldRefreshUsersOnResume({
  activeView = 'users',
  usersLoaded = false,
  lastSyncedAt = 0,
  now = Date.now(),
  staleMs = 30_000,
} = {}) {
  if (normalizeAdminView(activeView) !== 'users' || !usersLoaded) {
    return false;
  }
  return Number(now || 0) - Number(lastSyncedAt || 0) >= staleMs;
}

export function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatTopIpRequests(stats = {}, limit = 3) {
  const entries = ipRequestEntries(stats);
  if (entries.length > 0) {
    return entries
      .slice(0, limit)
      .map((entry) => `${entry.ip} ×${entry.requests}`)
      .join(', ');
  }
  return '-';
}

// 返回规范化、按请求次数降序排列的完整 IP 列表，供展开视图逐条显示
export function ipRequestEntries(stats = {}) {
  const entries = Array.isArray(stats.ipRequests) ? stats.ipRequests : [];
  if (entries.length > 0) {
    return entries
      .map((entry) => ({
        ip: String(entry.ip || '').trim(),
        requests: Number(entry.requests || 0),
        lastSeenAt: entry.lastSeenAt || '',
      }))
      .filter((entry) => entry.ip)
      .sort((left, right) => right.requests - left.requests);
  }
  if (stats.lastIp) {
    return [{ ip: String(stats.lastIp), requests: Number(stats.requestCount || 1), lastSeenAt: stats.lastSeenAt || '' }];
  }
  return [];
}

export function sourcePoolLabel(pool) {
  return pool === 'wuhusihai' ? '五湖四海私有池' : '公共池';
}

export function sourceKindLabel(kind) {
  const labels = {
    fixed: '固定源',
    manual: '手动源',
    'manual-node': '单节点',
    public: '公开源',
    telegram: 'TG 频道',
  };
  return labels[kind] || '订阅源';
}

export function formatSourceLastCount(value) {
  if (value == null || value === '') {
    return '-';
  }
  if (typeof value === 'object' && value.nodes != null) {
    return `${Number(value.nodes || 0)} 个`;
  }
  return `${Number(value || 0)} 个`;
}

export function formatProtocolSummary(protocols = {}) {
  const entries = Object.entries(protocols || {})
    .filter(([, count]) => Number(count || 0) > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return '-';
  }
  return entries.map(([protocol, count]) => `${protocol} ×${Number(count || 0)}`).join(', ');
}

export function visibleSelectionState(visibleUsers = [], selectedTokens = new Set()) {
  const selected = selectedTokens instanceof Set ? selectedTokens : new Set(selectedTokens || []);
  const visibleTokens = visibleUsers
    .map((user) => user.token)
    .filter(Boolean);
  const selectedCount = visibleTokens.filter((token) => selected.has(token)).length;
  return {
    totalCount: visibleTokens.length,
    selectedCount,
    allSelected: visibleTokens.length > 0 && selectedCount === visibleTokens.length,
    someSelected: selectedCount > 0 && selectedCount < visibleTokens.length,
  };
}

export function toggleVisibleSelection(visibleUsers = [], selectedTokens = new Set(), shouldSelect = false) {
  const next = new Set(selectedTokens || []);
  for (const user of visibleUsers) {
    if (!user.token) {
      continue;
    }
    if (shouldSelect) {
      next.add(user.token);
    } else {
      next.delete(user.token);
    }
  }
  return next;
}

export function removeUsersByTokens(users = [], tokens = []) {
  const tokenSet = new Set(tokens || []);
  return users.filter((user) => !tokenSet.has(user.token));
}

export function filterAndSortUsers(users, filters = {}) {
  const search = stringValue(filters.search);
  const status = filters.status || 'all';
  const sortBy = filters.sortBy || 'lastSeenAt';
  const sortDir = filters.sortDir === 'asc' ? 'asc' : 'desc';

  const filtered = users.filter((user) => {
    if (status !== 'all' && user.status !== status) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      user.label,
      user.token,
      user.subscription,
      statsOf(user).lastIp,
      formatTopIpRequests(statsOf(user)),
      statsOf(user).lastPath,
    ].some((value) => stringValue(value).includes(search));
  });

  const accessors = {
    label: (user) => stringValue(user.label),
    requestCount: (user) => Number(statsOf(user).requestCount || 0),
    bytesServed: (user) => Number(statsOf(user).bytesServed || 0),
    lastSeenAt: (user) => Date.parse(statsOf(user).lastSeenAt || user.createdAt || 0) || 0,
    createdAt: (user) => Date.parse(user.createdAt || 0) || 0,
    status: (user) => stringValue(user.status),
    ipCount: (user) => {
      const stats = statsOf(user);
      const entries = Array.isArray(stats.ipRequests) ? stats.ipRequests : [];
      if (entries.length > 0) {
        // 去重保底：理论上 ipRequests 已按 ip 聚合，去重防止脏数据
        return new Set(entries.map((entry) => entry.ip)).size;
      }
      return stats.lastIp ? 1 : 0;
    },
  };

  const readValue = accessors[sortBy] || accessors.lastSeenAt;
  return [...filtered].sort((left, right) => {
    const base = compareValues(readValue(left), readValue(right));
    if (base !== 0) {
      return sortDir === 'asc' ? base : -base;
    }
    return compareValues(stringValue(left.label), stringValue(right.label));
  });
}

export function buildTrendBuckets(users) {
  const totals = new Map();
  for (const user of users) {
    const userStats = statsOf(user);
    const hourlyRequests = userStats.hourlyRequests || [];
    if (hourlyRequests.length === 0 && userStats.lastSeenAt && Number(userStats.requestCount || 0) > 0) {
      const date = new Date(userStats.lastSeenAt);
      if (!Number.isNaN(date.getTime())) {
        const hour = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:00Z`;
        totals.set(hour, Number(totals.get(hour) || 0) + Number(userStats.requestCount || 0));
      }
    }
    for (const entry of hourlyRequests) {
      if (!entry || typeof entry.hour !== 'string') {
        continue;
      }
      totals.set(entry.hour, Number(totals.get(entry.hour) || 0) + Number(entry.requests || 0));
    }
  }

  return [...totals.entries()]
    .sort(([leftHour], [rightHour]) => compareValues(leftHour, rightHour))
    .map(([hour, requests]) => ({ hour, requests }));
}

export function topUsersBy(users, metric, limit = 5) {
  const readMetric = metric === 'bytesServed'
    ? (user) => Number(statsOf(user).bytesServed || 0)
    : (user) => Number(statsOf(user).requestCount || 0);

  return [...users]
    .sort((left, right) => compareValues(readMetric(right), readMetric(left)) || compareValues(stringValue(left.label), stringValue(right.label)))
    .slice(0, limit);
}

export const RANK_RANGE_OPTIONS = [
  { value: 'today', label: '当天' },
  { value: 'thisWeek', label: '本周' },
  { value: 'lastWeek', label: '上周' },
  { value: 'last7Days', label: '最近七天' },
  { value: 'thisMonth', label: '本月' },
  { value: 'lastMonth', label: '上月' },
  { value: 'allTime', label: '全部时间' },
];

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfLocalWeek(date) {
  const start = startOfLocalDay(date);
  const offset = (start.getDay() + 6) % 7;
  return addDays(start, -offset);
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromDayKey(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function rankRangeBounds(range = 'today', now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const today = startOfLocalDay(current);
  const thisWeek = startOfLocalWeek(current);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  if (range === 'thisWeek') {
    return { start: thisWeek, end: addDays(thisWeek, 7) };
  }
  if (range === 'lastWeek') {
    return { start: addDays(thisWeek, -7), end: thisWeek };
  }
  if (range === 'last7Days') {
    return { start: addDays(today, -6), end: addDays(today, 1) };
  }
  if (range === 'thisMonth') {
    return { start: thisMonth, end: addMonths(thisMonth, 1) };
  }
  if (range === 'lastMonth') {
    return { start: addMonths(thisMonth, -1), end: thisMonth };
  }
  if (range === 'allTime') {
    // 全部时间：从最早的日期（2000年）到未来
    return { start: new Date(2000, 0, 1), end: new Date(2099, 11, 31) };
  }
  return { start: today, end: addDays(today, 1) };
}

function isWithinRange(date, bounds) {
  const time = date?.getTime?.();
  return Number.isFinite(time) && time >= bounds.start.getTime() && time < bounds.end.getTime();
}

export function aggregateUserStatsForRange(user = {}, range = 'today', now = new Date()) {
  const bounds = rankRangeBounds(range, now);
  const userStats = statsOf(user);

  // 对于"全部时间"，直接使用用户的总统计数据
  if (range === 'allTime') {
    return {
      requestCount: Number(userStats.requestCount || 0),
      bytesServed: Number(userStats.bytesServed || 0),
    };
  }

  const total = { requestCount: 0, bytesServed: 0 };
  const daysCoveredByDailyStats = new Set();
  const averageBytesPerRequest = Number(userStats.requestCount || 0) > 0
    ? Number(userStats.bytesServed || 0) / Number(userStats.requestCount || 0)
    : 0;

  for (const entry of Array.isArray(userStats.dailyStats) ? userStats.dailyStats : []) {
    const dayStart = dateFromDayKey(entry.day);
    if (!dayStart || !isWithinRange(dayStart, bounds)) {
      continue;
    }
    daysCoveredByDailyStats.add(entry.day);
    total.requestCount += Number(entry.requests || 0);
    total.bytesServed += Number(entry.bytesServed || 0);
  }

  for (const entry of Array.isArray(userStats.hourlyRequests) ? userStats.hourlyRequests : []) {
    if (!entry || typeof entry.hour !== 'string') {
      continue;
    }
    const hourDate = new Date(entry.hour);
    if (!isWithinRange(hourDate, bounds) || daysCoveredByDailyStats.has(localDayKey(hourDate))) {
      continue;
    }
    const requests = Number(entry.requests || 0);
    const bytesServed = entry.bytesServed == null
      ? requests * averageBytesPerRequest
      : Number(entry.bytesServed || 0);
    total.requestCount += requests;
    total.bytesServed += Math.round(bytesServed);
  }

  return total;
}

export function rankUsersByRange(users = [], metric = 'requestCount', range = 'today', now = new Date(), limit = 5) {
  return [...users]
    .map((user) => {
      const totals = aggregateUserStatsForRange(user, range, now);
      const value = metric === 'bytesServed' ? totals.bytesServed : totals.requestCount;
      return { user, value, ...totals };
    })
    .sort((left, right) => compareValues(right.value, left.value) || compareValues(stringValue(left.user.label), stringValue(right.user.label)))
    .slice(0, limit);
}
