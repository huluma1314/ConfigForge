#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DIST_DIR = join(ROOT_DIR, 'dist');
const SUB_STORE_ADMIN_DIR = join(ROOT_DIR, 'src', 'sub-store-admin');
const UI_DIR = join(ROOT_DIR, 'src', 'ui');
const SUB_STORE_WORKER_DIR = join(ROOT_DIR, 'sub-store-worker');
const SUB_STORE_ADMIN_WRANGLER_CONFIG = join(SUB_STORE_WORKER_DIR, 'wrangler.admin.toml');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8789;
const TOKEN_PREFIX = 'sub-token:';
const SUBSCRIPTION_PATH = 'base64';
const CLASH_SUBSCRIPTION_PATH = 'clash-best';
const ALMA_CONFIG_DIR = join(process.env.HOME || '.', '.config', 'alma');
const ALMA_TG_NODES_DIR = process.env.ALMA_TG_NODES_DIR || join(process.env.HOME || '.', 'tg_nodes');
const PRIVATE_SOURCES_FILE = join(ALMA_CONFIG_DIR, 'tg-fetcher-private-sources.json');
const MANUAL_NODES_FILE = process.env.ALMA_MANUAL_NODES_FILE || join(ALMA_CONFIG_DIR, 'tg-fetcher-manual-nodes.json');
const TG_FETCHER_SCRIPT = process.env.TG_FETCHER_SCRIPT || join(ROOT_DIR, '..', 'Alma', 'tg_node_fetcher.py');
const TG_FETCHER_STATE_FILE = join(ALMA_CONFIG_DIR, 'state', 'tg-node-fetcher.state.json');
const NODE_FILTER_STATE_FILE = join(ALMA_CONFIG_DIR, 'state', 'node-filter.state.json');
const NODE_FILTER_LOG_DIR = join(process.env.HOME || '.', 'Desktop', 'AlmaLogs', 'node-filter-runs');
const WUHUSIHAI_FETCHER_STATE_FILE = join(ALMA_CONFIG_DIR, 'state', 'wuhusihai-node-fetcher.state.json');
const WUHUSIHAI_FILTER_STATE_FILE = join(ALMA_CONFIG_DIR, 'state', 'wuhusihai-node-filter.state.json');
const WUHUSIHAI_FILTER_LOG_DIR = join(process.env.HOME || '.', 'Desktop', 'AlmaLogs', 'wuhusihai-filter-runs');
const ALMA_PIPELINES = {
  public: {
    label: '通用池',
    fetchStateFile: TG_FETCHER_STATE_FILE,
    filterStateFile: NODE_FILTER_STATE_FILE,
    filterLogDir: NODE_FILTER_LOG_DIR,
    filterLogPrefixes: ['public-node-filter-', 'node-filter-'],
  },
  wuhusihai: {
    label: '五湖四海',
    fetchStateFile: WUHUSIHAI_FETCHER_STATE_FILE,
    filterStateFile: WUHUSIHAI_FILTER_STATE_FILE,
    filterLogDir: WUHUSIHAI_FILTER_LOG_DIR,
    filterLogPrefixes: ['wuhusihai-node-filter-'],
  },
};
const SUB_FETCH_PROXY_FILE = join(ALMA_CONFIG_DIR, 'sub-fetch-proxy');
const SOURCE_POOLS = new Set(['public', 'wuhusihai']);
const MANUAL_NODE_PROTOCOLS = new Set(['vmess', 'vless', 'ss', 'ssr', 'trojan', 'hy2', 'hysteria', 'hysteria2', 'tuic', 'anytls']);
const SOURCE_POOL_LABELS = {
  public: '公共池',
  wuhusihai: '五湖四海私有池',
};
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const COMMAND_PATHS = [
  dirname(process.execPath),
  '/Users/huluma/.npm-global/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

export function buildChildEnv(baseEnv = process.env) {
  const paths = new Set([
    ...COMMAND_PATHS,
    ...String(baseEnv.PATH || '').split(':').filter(Boolean),
  ]);
  return {
    ...baseEnv,
    PATH: [...paths].join(':'),
  };
}

export function buildWranglerArgs(args = []) {
  return ['--config', SUB_STORE_ADMIN_WRANGLER_CONFIG, ...args];
}

export function validateLabel(value) {
  const label = String(value || '').trim();
  if (!label) {
    throw new Error('Name is required');
  }
  if (label.length > 80) {
    throw new Error('Name is too long');
  }
  return label;
}

export function validateToken(value) {
  const token = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    throw new Error('Invalid token');
  }
  return token;
}

export function validateTokenList(value) {
  const rawTokens = Array.isArray(value) ? value : [value];
  const tokens = [...new Set(rawTokens.map((token) => validateToken(token)))];
  if (tokens.length === 0) {
    throw new Error('Invalid token');
  }
  if (tokens.length > 100) {
    throw new Error('Too many tokens');
  }
  return tokens;
}

function hashText(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function makeToken() {
  return randomBytes(24).toString('base64url');
}

export function subscriptionLinksFromToken(token) {
  const validatedToken = validateToken(token);
  const base64Subscription = `https://sub.huluma.dpdns.org/${SUBSCRIPTION_PATH}?token=${validatedToken}`;
  const clashSubscription = `https://sub.huluma.dpdns.org/${CLASH_SUBSCRIPTION_PATH}?token=${validatedToken}`;
  return {
    subscription: base64Subscription,
    base64Subscription,
    clashSubscription,
    deliveryText: [
      `base64订阅链接：${base64Subscription}`,
      `clash订阅链接：${clashSubscription}`,
    ].join('\n'),
  };
}

function sourceIdFromRecord(record = {}) {
  if (record.id && /^[A-Za-z0-9:_-]{4,120}$/.test(String(record.id))) {
    return String(record.id);
  }
  const basis = `${record.name || 'source'}\n${record.url || ''}`;
  return `manual-${hashText(basis).slice(0, 12)}`;
}

function manualNodeIdFromRecord(record = {}) {
  if (record.id && /^[A-Za-z0-9:_-]{4,120}$/.test(String(record.id))) {
    return String(record.id);
  }
  const basis = `${record.name || 'node'}\n${record.uri || record.node || record.url || ''}`;
  return `manual-node-${hashText(basis).slice(0, 12)}`;
}

function validateSourceId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9:_-]{4,120}$/.test(id)) {
    throw new Error('Invalid source id');
  }
  return id;
}

export function validateSubscriptionSourceInput(value = {}) {
  const name = validateLabel(value.name);
  const url = String(value.url || '').trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Subscription URL must start with http(s)');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Subscription URL must start with http(s)');
  }

  const pool = String(value.pool || 'public').trim();
  if (!SOURCE_POOLS.has(pool)) {
    throw new Error('Invalid target pool');
  }

  return {
    id: value.id ? validateSourceId(value.id) : `manual-${randomUUID()}`,
    name,
    url,
    pool,
    enabled: value.enabled !== false,
  };
}

export function validateManualNodeInput(value = {}) {
  const name = validateLabel(value.name);
  const uri = String(value.uri || value.node || value.url || '').trim();
  const match = uri.match(/^([a-z0-9]+):\/\//i);
  if (!match || !MANUAL_NODE_PROTOCOLS.has(match[1].toLowerCase())) {
    throw new Error('Node URI must start with a supported proxy scheme');
  }

  const pool = String(value.pool || 'public').trim();
  if (!SOURCE_POOLS.has(pool)) {
    throw new Error('Invalid target pool');
  }

  return {
    id: value.id ? validateSourceId(value.id) : `manual-node-${randomUUID()}`,
    name,
    uri,
    pool,
    enabled: value.enabled !== false,
  };
}

export function normalizeManualSubscriptionSources(rawSources = []) {
  const input = Array.isArray(rawSources)
    ? rawSources
    : Object.entries(rawSources || {}).map(([name, url]) => ({ name, url }));
  const normalized = [];
  const seen = new Set();

  for (const source of input) {
    const record = typeof source === 'string'
      ? { name: `source-${normalized.length + 1}`, url: source }
      : source;
    try {
      const id = sourceIdFromRecord(record);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      normalized.push(validateSubscriptionSourceInput({
        id,
        name: record.name,
        url: record.url,
        pool: record.pool || 'public',
        enabled: record.enabled !== false,
      }));
    } catch {
      // Keep the admin UI resilient if an old hand-written entry is malformed.
    }
  }
  return normalized;
}

export function normalizeManualNodes(rawNodes = []) {
  const input = Array.isArray(rawNodes)
    ? rawNodes
    : Object.entries(rawNodes || {}).map(([name, uri]) => ({ name, uri }));
  const normalized = [];
  const seenIds = new Set();
  const seenUris = new Set();

  for (const item of input) {
    const record = typeof item === 'string'
      ? { name: `manual-node-${normalized.length + 1}`, uri: item }
      : item;
    try {
      const id = manualNodeIdFromRecord(record);
      const next = validateManualNodeInput({
        id,
        name: record.name,
        uri: record.uri || record.node || record.url,
        pool: record.pool || 'public',
        enabled: record.enabled !== false,
      });
      if (seenIds.has(next.id) || seenUris.has(next.uri)) {
        continue;
      }
      seenIds.add(next.id);
      seenUris.add(next.uri);
      normalized.push(next);
    } catch {
      // Keep the admin UI resilient if an old hand-written entry is malformed.
    }
  }
  return normalized;
}

export async function loadManualSubscriptionSources(path = PRIVATE_SOURCES_FILE) {
  try {
    return normalizeManualSubscriptionSources(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function loadManualNodes(path = MANUAL_NODES_FILE) {
  try {
    return normalizeManualNodes(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function saveManualSubscriptionSources(sources, path = PRIVATE_SOURCES_FILE) {
  const normalized = normalizeManualSubscriptionSources(sources);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function saveManualNodes(nodes, path = MANUAL_NODES_FILE) {
  const normalized = normalizeManualNodes(nodes);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function migrateManualSubscriptionSources(path = PRIVATE_SOURCES_FILE) {
  let rawText;
  try {
    rawText = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const normalized = normalizeManualSubscriptionSources(JSON.parse(rawText));
  const normalizedText = `${JSON.stringify(normalized, null, 2)}\n`;
  if (rawText.trim() !== normalizedText.trim()) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, normalizedText, 'utf8');
  }
  return normalized;
}

export function upsertManualSubscriptionSource(sources = [], input = {}) {
  const normalized = normalizeManualSubscriptionSources(sources);
  const next = validateSubscriptionSourceInput(input);
  const idIndex = normalized.findIndex((source) => source.id === next.id);
  const urlIndex = normalized.findIndex((source) => source.url === next.url);

  if (idIndex === -1 && urlIndex === -1) {
    return [...normalized, next];
  }

  if (idIndex === -1) {
    return normalized.map((source, sourceIndex) => (
      sourceIndex === urlIndex ? { ...next, id: source.id } : source
    ));
  }

  const updated = { ...next, id: normalized[idIndex].id };
  return normalized
    .map((source, sourceIndex) => (sourceIndex === idIndex ? updated : source))
    .filter((source, sourceIndex) => sourceIndex === idIndex || source.url !== updated.url);
}

export function upsertManualNode(nodes = [], input = {}) {
  const normalized = normalizeManualNodes(nodes);
  const next = validateManualNodeInput(input);
  const idIndex = normalized.findIndex((node) => node.id === next.id);
  const uriIndex = normalized.findIndex((node) => node.uri === next.uri);

  if (idIndex === -1 && uriIndex === -1) {
    return [...normalized, next];
  }

  if (idIndex === -1) {
    return normalized.map((node, nodeIndex) => (
      nodeIndex === uriIndex ? { ...next, id: node.id } : node
    ));
  }

  const updated = { ...next, id: normalized[idIndex].id };
  return normalized
    .map((node, nodeIndex) => (nodeIndex === idIndex ? updated : node))
    .filter((node, nodeIndex) => nodeIndex === idIndex || node.uri !== updated.uri);
}

export function deleteManualSubscriptionSource(sources = [], id) {
  const sourceId = validateSourceId(id);
  return normalizeManualSubscriptionSources(sources).filter((source) => source.id !== sourceId);
}

export function deleteManualNode(nodes = [], id) {
  const nodeId = validateSourceId(id);
  return normalizeManualNodes(nodes).filter((node) => node.id !== nodeId);
}

function protocolOfNode(node = '') {
  const match = String(node).match(/^([a-z0-9]+):\/\//i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function nodeEndpointPreview(node = '') {
  const text = String(node || '').trim();
  const protocol = protocolOfNode(text);
  let label = '';
  if (text.includes('#')) {
    try {
      label = `#${decodeURIComponent(text.split('#').pop()).slice(0, 32)}`;
    } catch {
      label = `#${text.split('#').pop().slice(0, 32)}`;
    }
  }
  if (protocol === 'vmess') {
    try {
      const payload = text.slice('vmess://'.length).split('#')[0].trim();
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      const info = JSON.parse(decoded);
      const endpoint = info.add ? `${info.add}${info.port ? `:${info.port}` : ''}` : '<hidden>';
      const vmessLabel = String(info.ps || '').trim() ? `#${String(info.ps).trim().slice(0, 32)}` : label;
      return `vmess://${endpoint}${vmessLabel}`;
    } catch {
      return `vmess://<hidden>${label}`;
    }
  }
  if (protocol === 'ssr') {
    return `ssr://<hidden>${label}`;
  }
  try {
    const url = new URL(text);
    const endpoint = url.hostname ? `${url.hostname}${url.port ? `:${url.port}` : ''}` : '<hidden>';
    if (endpoint.length > 120) {
      return `${protocol}://<hidden>${label}`;
    }
    return `${protocol}://${endpoint}${label}`;
  } catch {
    return `${protocol}://<hidden>${label}`;
  }
}

export function buildSourceTestSummary(nodes = []) {
  const protocols = {};
  const cleaned = nodes
    .map((node) => String(node || '').trim())
    .filter((node) => /^[a-z0-9]+:\/\//i.test(node));
  for (const node of cleaned) {
    const protocol = protocolOfNode(node);
    protocols[protocol] = Number(protocols[protocol] || 0) + 1;
  }
  return {
    count: cleaned.length,
    protocols: Object.fromEntries(Object.entries(protocols).sort(([left], [right]) => left.localeCompare(right))),
    preview: cleaned.slice(0, 3).map(nodeEndpointPreview),
  };
}

function numberFromText(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? Number(match[1]) : null;
}

function finiteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function countNonEmptyLines(text = '') {
  return String(text || '').split(/\r?\n/).filter((line) => line.trim()).length;
}

function durationSecondsFromState(state = {}) {
  const startedAt = Date.parse(String(state?.last_started_at || ''));
  const finishedAt = Date.parse(String(state?.last_finished_at || ''));
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    return null;
  }
  return Math.round((finishedAt - startedAt) / 1000);
}

function maskSubscriptionUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    return `${parsed.protocol}//${parsed.host}/...`;
  } catch {
    return '<hidden>';
  }
}

async function readNodeFileSummary(path) {
  const text = await readTextFileIfExists(path);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    count: lines.length,
  };
}

async function readDiscoveredSubscriptionSummary(path) {
  const data = await readJsonFileIfExists(path, {});
  const stats = data && typeof data === 'object' && data.stats && typeof data.stats === 'object'
    ? data.stats
    : {};
  const entries = Object.entries(stats).map(([url, stat]) => ({
    url: maskSubscriptionUrl(url),
    status: String(stat?.status || ''),
    nodes: Number(stat?.nodes || 0),
    fetchedNodes: Number(stat?.fetched_nodes || 0),
    truncated: Boolean(stat?.truncated),
  }));
  const ok = entries.filter((item) => item.status === 'ok').length;
  const empty = entries.filter((item) => item.status === 'empty').length;
  const truncated = entries.filter((item) => item.truncated).length;
  const nodes = entries.reduce((sum, item) => sum + item.nodes, 0);
  const fetchedNodes = entries.reduce((sum, item) => sum + item.fetchedNodes, 0);
  return {
    total: entries.length,
    ok,
    empty,
    failed: entries.length - ok - empty,
    nodes,
    fetchedNodes,
    truncated,
    top: entries
      .filter((item) => item.nodes > 0 || item.status)
      .sort((left, right) => right.nodes - left.nodes || left.url.localeCompare(right.url))
      .slice(0, 20),
  };
}

export function parseNodeFilterLogSummary(logText = '', { pool = 'public' } = {}) {
  const text = String(logText || '').replace(ANSI_PATTERN, '');
  const sourceRows = [];
  const sourcePattern = /^\s{2,}(.+?):\s*(\d+)\/(\d+)\s*\(([\d.]+)%\).*$/gm;
  let match;
  while ((match = sourcePattern.exec(text)) !== null) {
    sourceRows.push({
      name: match[1],
      passed: Number(match[2]),
      total: Number(match[3]),
      ratio: Number(match[4]),
    });
  }

  const privatePool = pool === 'wuhusihai';
  const privateHistory = text.match(/五湖四海 Clash Verge：历史\s*(\d+)，可解析\s*(\d+)/);
  const hasStrictResult = /严格通过：\d+\//.test(text)
    || /实时响应：\d+\//.test(text)
    || /五湖四海(?:实测通过|实时响应)\s*\d+/.test(text);
  const rawCount = privatePool
    ? (privateHistory ? Number(privateHistory[1]) : numberFromText(text, /五湖四海实测通过\s*\d+\/(\d+)/))
    : numberFromText(text, /原始节点总数：(\d+)/);
  const parsedCount = privatePool
    ? (privateHistory ? Number(privateHistory[2]) : null)
    : numberFromText(text, /解析成功：(\d+)/);
  const strictPassedCount = privatePool
    ? (numberFromText(text, /五湖四海实时响应\s*(\d+)/) ?? numberFromText(text, /五湖四海实测通过\s*(\d+)\//))
    : (numberFromText(text, /实时响应：(\d+)\//) ?? numberFromText(text, /严格通过：(\d+)\//));
  const exportedCount = privatePool
    ? (numberFromText(text, /前\s*\d+\s*导出\s*(\d+)\//) ?? numberFromText(text, /五湖四海实测通过\s*(\d+)\//))
    : (
      numberFromText(text, /前\s*\d+\s*导出：(\d+)/)
      ??
      numberFromText(text, /filtered_client_best_base64\.txt:\s*(\d+)\s*个(?:本机严格通过)?节点/)
      ?? numberFromText(text, /filtered_(?:best_)?base64\.txt:\s*(\d+)\s*个(?:本机严格通过)?节点/)
    );

  return {
    pool: privatePool ? 'wuhusihai' : 'public',
    rawCount,
    parsedCount,
    strictPassedCount,
    exportedCount,
    durationSeconds: numberFromText(text, /总耗时\s*(\d+)s/),
    sources: sourceRows,
    legacy: !hasStrictResult,
  };
}

export function buildAlmaRunTrendItem({ date = '', total = 0, filter = {} } = {}) {
  const rawCount = finiteNumberOrNull(filter?.rawCount) ?? finiteNumberOrNull(total) ?? 0;
  const parsedCount = finiteNumberOrNull(filter?.parsedCount);
  const strictPassedCount = finiteNumberOrNull(filter?.strictPassedCount);
  const exportedCount = finiteNumberOrNull(filter?.exportedCount);
  const strictRatio = rawCount > 0 && strictPassedCount !== null
    ? roundOne((strictPassedCount / rawCount) * 100)
    : null;

  return {
    date,
    rawCount,
    parsedCount,
    strictPassedCount,
    exportedCount,
    strictRatio,
    legacy: Boolean(filter?.legacy),
  };
}

function sourceCountsFromState(tgState = {}) {
  const counts = tgState && typeof tgState === 'object' && tgState.source_counts && typeof tgState.source_counts === 'object'
    ? tgState.source_counts
    : {};
  return Object.entries(counts)
    .map(([name, value]) => {
      const objectValue = value && typeof value === 'object' ? value : null;
      return {
        name,
        title: objectValue?.title || name,
        count: objectValue ? Number(objectValue.nodes || 0) : Number(value || 0),
        messages: objectValue ? Number(objectValue.messages || 0) : null,
        urls: objectValue ? Number(objectValue.urls || 0) : null,
        registeredUrls: objectValue ? Number(objectValue.registered_urls || 0) : null,
        refreshedUrls: objectValue ? Number(objectValue.refreshed_urls || 0) : null,
        validUrls: objectValue ? Number(objectValue.valid_urls || 0) : null,
      };
    })
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export async function buildAlmaRunDaySummary({
  date,
  dayDir,
  tgState = {},
  filterState = {},
  filterLogText = '',
  pool = 'public',
} = {}) {
  const tgStateDate = String(tgState?.last_finished_at || tgState?.last_started_at || '').slice(0, 10);
  const filterStateDate = String(filterState?.last_finished_at || filterState?.last_started_at || '').slice(0, 10);
  const effectiveTgState = tgStateDate === date ? tgState : {};
  const effectiveFilterState = filterStateDate === date ? filterState : {};
  const publicFileMap = {
    allNodes: ['all_nodes.txt', '公共聚合池'],
    publicDaily: ['public_daily_nodes.txt', '公开日更源'],
    fixedAndManualPublic: ['fixed_subscription_nodes.txt', '固定/手动公共源'],
    tgSubscriptions: ['tg_channel_subscription_nodes.txt', 'TG 节点池'],
    manualWuhusihai: ['manual_wuhusihai_subscription_nodes.txt', '手动五湖四海源'],
  };
  const filter = parseNodeFilterLogSummary(filterLogText, { pool });
  if (filter.durationSeconds === null) {
    filter.durationSeconds = durationSecondsFromState(effectiveFilterState);
  }
  const files = {};
  if (pool === 'wuhusihai') {
    files.history = {
      label: '180 天历史节点',
      filename: 'wuhusihaiNodes.txt',
      count: filter.rawCount,
    };
  } else {
    for (const [key, [filename, label]] of Object.entries(publicFileMap)) {
      files[key] = {
        label,
        filename,
        ...(await readNodeFileSummary(join(dayDir, filename))),
      };
    }
  }

  const discovered = pool === 'wuhusihai'
    ? {
      tg: { total: 0, ok: 0, empty: 0, failed: 0, nodes: 0, fetchedNodes: 0, truncated: 0, top: [] },
      wuhusihai: await readDiscoveredSubscriptionSummary(join(dayDir, 'wuhusihai_discovered_subscriptions.json')),
    }
    : {
      tg: await readDiscoveredSubscriptionSummary(join(dayDir, 'tg_discovered_subscriptions.json')),
      wuhusihai: await readDiscoveredSubscriptionSummary(join(dayDir, 'wuhusihai_discovered_subscriptions.json')),
    };

  return {
    pool,
    date,
    fetch: {
      status: effectiveTgState?.status || '',
      startedAt: effectiveTgState?.last_started_at || '',
      finishedAt: effectiveTgState?.last_finished_at || '',
      proxy: effectiveTgState?.proxy || '',
      summary: effectiveTgState?.summary || {},
    },
    filter: {
      status: effectiveFilterState?.status || '',
      startedAt: effectiveFilterState?.last_started_at || '',
      finishedAt: effectiveFilterState?.last_finished_at || '',
      ...filter,
    },
    files,
    discovered,
    sourceCounts: pool === 'wuhusihai' ? [] : sourceCountsFromState(effectiveTgState),
  };
}

async function listAlmaRunDates(baseDir = ALMA_TG_NODES_DIR, limit = 14) {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function latestFilterLogForDate(date, pipeline = ALMA_PIPELINES.public) {
  const compactDate = String(date || '').replaceAll('-', '');
  if (!compactDate) {
    return '';
  }
  try {
    const entries = await readdir(pipeline.filterLogDir);
    const matched = entries
      .filter((name) => pipeline.filterLogPrefixes.some((prefix) => name.startsWith(`${prefix}${compactDate}-`)) && name.endsWith('.log'))
      .sort();
    const latest = matched.at(-1);
    return latest ? await readTextFileIfExists(join(pipeline.filterLogDir, latest)) : '';
  } catch {
    return '';
  }
}

async function listFilterLogDates(pipeline, limit) {
  try {
    const entries = await readdir(pipeline.filterLogDir);
    return [...new Set(entries
      .map((name) => {
        const prefix = pipeline.filterLogPrefixes.find((item) => name.startsWith(item));
        const match = prefix && name.match(/(\d{4})(\d{2})(\d{2})-/);
        return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
      })
      .filter(Boolean))]
      .sort()
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function listAlmaPipelineRuns(pool, searchParams = new URLSearchParams()) {
  const pipeline = ALMA_PIPELINES[pool];
  const requestedDays = Number(searchParams.get('days') || 14);
  const dayLimit = Math.min(Math.max(Number.isFinite(requestedDays) ? requestedDays : 14, 1), 60);
  const dates = pool === 'public'
    ? await listAlmaRunDates(ALMA_TG_NODES_DIR, dayLimit)
    : await listFilterLogDates(pipeline, dayLimit);
  const selectedDate = dates.includes(searchParams.get('date')) ? searchParams.get('date') : dates[0] || '';
  const tgState = await readJsonFileIfExists(pipeline.fetchStateFile, {});
  const filterState = await readJsonFileIfExists(pipeline.filterStateFile, {});

  const days = [];
  const trend = [];
  const filterLogsByDate = new Map();
  for (const date of dates) {
    const dayDir = join(ALMA_TG_NODES_DIR, date);
    const allNodesText = pool === 'public' ? await readTextFileIfExists(join(dayDir, 'all_nodes.txt')) : '';
    const total = countNonEmptyLines(allNodesText);
    const filterLogText = await latestFilterLogForDate(date, pipeline);
    filterLogsByDate.set(date, filterLogText);
    const filter = parseNodeFilterLogSummary(filterLogText, { pool });
    const trendItem = buildAlmaRunTrendItem({
      date,
      total,
      filter,
    });
    days.push({
      date,
      total: trendItem.rawCount,
      selected: date === selectedDate,
    });
    trend.push(trendItem);
  }

  const current = selectedDate
    ? await buildAlmaRunDaySummary({
        date: selectedDate,
        dayDir: join(ALMA_TG_NODES_DIR, selectedDate),
        tgState,
        filterState,
        filterLogText: filterLogsByDate.get(selectedDate) || await latestFilterLogForDate(selectedDate, pipeline),
        pool,
      })
    : null;

  return {
    pool,
    label: pipeline.label,
    days,
    selectedDate,
    trend: [...trend].reverse(),
    current,
    recentState: {
      fetch: tgState,
      filter: filterState,
    },
  };
}

async function listAlmaRuns(searchParams = new URLSearchParams()) {
  const [publicPipeline, wuhusihaiPipeline] = await Promise.all([
    listAlmaPipelineRuns('public', searchParams),
    listAlmaPipelineRuns('wuhusihai', searchParams),
  ]);
  return {
    pipelines: {
      public: publicPipeline,
      wuhusihai: wuhusihaiPipeline,
    },
    ...publicPipeline,
  };
}

export async function fastTokenAdd(label, env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  if (!apiToken) {
    // 回退到 wrangler
    const output = await runTokenCommand(['add', '--label', label, '--write']);
    const parsed = parseTokenCommandOutput(output);
    return {
      ...parsed,
      ...subscriptionLinksFromToken(parsed.token),
    };
  }

  // 使用 REST API
  const token = makeToken();
  const key = `${TOKEN_PREFIX}${token}`;
  const now = new Date().toISOString();
  const record = {
    label,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await cfKvPut(key, JSON.stringify(record, null, 2), env);

  return {
    token,
    kvKey: key,
    record,
    ...subscriptionLinksFromToken(token),
  };
}

async function fastTokenUpdate(token, updates, env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const key = `${TOKEN_PREFIX}${token}`;

  if (!apiToken) {
    // 回退到 wrangler
    const args = [updates.status === 'disabled' ? 'disable' : 'enable', '--token', token, '--write'];
    if (updates.label) {
      args.push('--label', updates.label);
    }
    const output = await runTokenCommand(args);
    return parseTokenCommandOutput(output);
  }

  // 使用 REST API
  const raw = await cfKvGet(key, env);
  if (!raw) {
    throw new Error('Token not found');
  }

  const previousRecord = JSON.parse(raw);
  const record = {
    ...previousRecord,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await cfKvPut(key, JSON.stringify(record, null, 2), env);

  return {
    token,
    kvKey: key,
    record,
  };
}

async function fastTokenDelete(token, env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const key = `${TOKEN_PREFIX}${token}`;

  if (!apiToken) {
    // 回退到 wrangler
    const output = await runTokenCommand(['delete', '--token', token, '--write']);
    return parseTokenCommandOutput(output);
  }

  // 使用 REST API
  await cfKvDelete(key, env);

  return {
    token,
    kvKey: key,
    deleted: true,
  };
}

export function parseTokenCommandOutput(output) {
  const result = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (key === 'token' || key === 'kv_key' || key === 'subscription') {
      result[key === 'kv_key' ? 'kvKey' : key] = value;
    }
    if (key === 'deleted') {
      result.deleted = value === 'true';
    }
    if (key === 'record') {
      result.record = JSON.parse(value);
    }
  }
  return result;
}

export function listUsersFromRecords(items) {
  return items
    .filter((item) => item?.name?.startsWith(TOKEN_PREFIX) && item.value)
    .map((item) => {
      const token = item.name.slice(TOKEN_PREFIX.length);
      return {
        label: item.value.label || '未命名',
        token,
        ...subscriptionLinksFromToken(token),
        status: item.value.status || 'active',
        createdAt: item.value.createdAt || '',
        stats: item.value.stats || {
          requestCount: 0,
          bytesServed: 0,
          lastIp: '',
          ipRequests: [],
          lastSeenAt: '',
          lastPath: '',
        },
      };
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.stats?.lastSeenAt || left.createdAt || 0) || 0;
      const rightTime = Date.parse(right.stats?.lastSeenAt || right.createdAt || 0) || 0;
      return rightTime - leftTime;
    });
}

export function cleanCliError(message) {
  const normalized = String(message || '')
    .replace(ANSI_PATTERN, '')
    .replace(/\r/g, '')
    .replace(/\n+/g, '\n')
    .trim();

  if (/No internet connection|connectivity issue|network connectivity problems|fetch request failed/i.test(normalized)) {
    return 'Cloudflare 连接失败。请检查网络、VPN 或稍后再试。';
  }
  if (/Invalid token/i.test(normalized)) {
    return 'Token 格式不对，请重新粘贴。';
  }
  if (/Name is required/i.test(normalized)) {
    return '请先填写用户备注。';
  }
  if (/Name is too long/i.test(normalized)) {
    return '用户备注太长了，尽量简短一点。';
  }
  if (/Local access only/i.test(normalized)) {
    return '这个管理页只能在本机打开。';
  }

  const usefulLines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^▲|^Resource location:|^Logs were written to|^Processing wrangler\.toml|^- "unsafe" fields are experimental/i.test(line));
  return usefulLines[0] || '操作失败，请再试一次。';
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function isLocalHostname(hostname) {
  return ['127.0.0.1', 'localhost', '::1'].includes(hostname);
}

function configuredPublicAdminOrigin(env = process.env) {
  const rawOrigin = String(env.SUB_STORE_ADMIN_PUBLIC_ORIGIN || '').trim();
  if (!rawOrigin) {
    return null;
  }
  try {
    const origin = new URL(rawOrigin);
    if (!['https:', 'http:'].includes(origin.protocol) || !origin.hostname) {
      return null;
    }
    return origin;
  } catch {
    return null;
  }
}

function normalizedOrigin(url) {
  return `${url.protocol}//${url.host}`;
}

function allowedAccessEmails(env = process.env) {
  return new Set(
    String(env.SUB_STORE_ADMIN_ALLOWED_EMAILS || '')
      .split(/[,\s]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function decodeBase64UrlJson(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function emailFromCloudflareAccessJwt(jwt = '') {
  const parts = String(jwt || '').split('.');
  if (parts.length < 2) {
    return '';
  }
  const payload = decodeBase64UrlJson(parts[1]);
  return String(payload?.email || payload?.identity?.email || '').trim().toLowerCase();
}

function hasAllowedCloudflareAccessIdentity(request, env = process.env) {
  const email = String(request.headers.get('cf-access-authenticated-user-email') || '').trim().toLowerCase();
  let jwt = String(request.headers.get('cf-access-jwt-assertion') || '').trim();

  // 如果 header 中没有 JWT，尝试从 Cookie 中读取
  if (!jwt) {
    const cookies = String(request.headers.get('cookie') || '');
    const match = cookies.match(/CF_Authorization=([^;]+)/);
    if (match) {
      jwt = decodeURIComponent(match[1]);
    }
  }

  const jwtEmail = emailFromCloudflareAccessJwt(jwt);
  const allowedEmails = allowedAccessEmails(env);
  if (allowedEmails.size > 0) {
    return [email, jwtEmail].some((identityEmail) => Boolean(identityEmail) && allowedEmails.has(identityEmail));
  }
  return Boolean(email || jwt);
}

function effectivePort(url) {
  if (url.port) {
    return url.port;
  }
  return url.protocol === 'https:' ? '443' : '80';
}

function isSameOrigin(left, right) {
  return left.protocol === right.protocol
    && left.hostname === right.hostname
    && effectivePort(left) === effectivePort(right);
}

function isPublicAdminPageNavigation(request, url) {
  const fetchMode = request.headers.get('sec-fetch-mode');
  const fetchDest = request.headers.get('sec-fetch-dest');
  return ['GET', 'HEAD'].includes(request.method)
    && !url.pathname.startsWith('/api/')
    && fetchMode === 'navigate'
    && (!fetchDest || fetchDest === 'document');
}

function hasAllowedBrowserOrigin(request, expectedOrigin, options = {}) {
  const rawOrigin = request.headers.get('origin');
  const origin = rawOrigin && rawOrigin !== 'null' ? rawOrigin : '';
  if (origin) {
    try {
      if (normalizedOrigin(new URL(origin)) !== normalizedOrigin(expectedOrigin)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  return !fetchSite
    || fetchSite === 'same-origin'
    || fetchSite === 'none'
    || (fetchSite === 'cross-site' && options.allowCrossSiteDocumentNavigation);
}

function isCloudflareTunnelRequest(request) {
  return !!(
    request.headers.get('cf-connecting-ip')
    || request.headers.get('cf-ray')
    || request.headers.get('cf-visitor')
  );
}

function reconstructPublicUrl(request, env = process.env) {
  const publicOrigin = configuredPublicAdminOrigin(env);
  if (!publicOrigin) {
    return null;
  }
  const originalUrl = new URL(request.url);
  return new URL(originalUrl.pathname + originalUrl.search, publicOrigin);
}

function isAllowedPublicAdminRequest(request, url, env = process.env) {
  const publicOrigin = configuredPublicAdminOrigin(env);
  if (!publicOrigin || url.hostname !== publicOrigin.hostname) {
    return false;
  }
  if (!hasAllowedCloudflareAccessIdentity(request, env)) {
    return false;
  }
  return hasAllowedBrowserOrigin(request, publicOrigin, {
    allowCrossSiteDocumentNavigation: isPublicAdminPageNavigation(request, url),
  });
}

export function isAllowedLocalAdminRequest(request, url, env = process.env) {
  // Cloudflare Tunnel 转发检测：本地 hostname 但带 CF 头
  if (isLocalHostname(url.hostname) && isCloudflareTunnelRequest(request)) {
    const publicUrl = reconstructPublicUrl(request, env);
    if (publicUrl) {
      return isAllowedPublicAdminRequest(request, publicUrl, env);
    }
  }

  if (!isLocalHostname(url.hostname)) {
    return isAllowedPublicAdminRequest(request, url, env);
  }

  if (
    ['GET', 'HEAD'].includes(request.method)
    && !url.pathname.startsWith('/api/')
  ) {
    return true;
  }

  const rawOrigin = request.headers.get('origin');
  const origin = rawOrigin && rawOrigin !== 'null' ? rawOrigin : '';
  if (origin) {
    try {
      if (!isSameOrigin(new URL(origin), url)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

async function readJson(request) {
  try {
    return JSON.parse(await request.text());
  } catch {
    throw new Error('Invalid request body');
  }
}

function runTokenCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/sub-store-token.mjs', ...args], {
      cwd: ROOT_DIR,
      env: buildChildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(cleanCliError(stderr || stdout || `Command failed with ${code}`)));
    });
  });
}

function parseWranglerJson(stdout) {
  // wrangler 输出可能混了 ANSI 警告/banner 和 "Success!" 后缀，提取首尾大括号或方括号之间的 JSON
  const cleaned = String(stdout || '').replace(ANSI_PATTERN, '');
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  let start = -1;
  let endChar = '';
  if (objStart === -1 && arrStart === -1) {
    throw new Error('wrangler returned no JSON');
  }
  if (objStart === -1 || (arrStart !== -1 && arrStart < objStart)) {
    start = arrStart;
    endChar = ']';
  } else {
    start = objStart;
    endChar = '}';
  }
  const end = cleaned.lastIndexOf(endChar);
  if (end <= start) {
    throw new Error('wrangler JSON malformed');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function runWranglerJson(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('wrangler', buildWranglerArgs(args), {
      cwd: SUB_STORE_WORKER_DIR,
      env: buildChildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(cleanCliError(stderr || stdout || `wrangler failed with ${code}`)));
    });
  });
}

function runFetcherJson(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.TG_FETCHER_PYTHON || 'python3.12', [TG_FETCHER_SCRIPT, ...args], {
      cwd: dirname(TG_FETCHER_SCRIPT),
      env: buildChildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout || '{}'));
        } catch (error) {
          reject(new Error(`抓取脚本返回的 JSON 无法解析：${error.message}`));
        }
        return;
      }
      reject(new Error(cleanCliError(stderr || stdout || `tg_node_fetcher failed with ${code}`)));
    });
  });
}

async function readJsonFileIfExists(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return fallback;
    }
    return fallback;
  }
}

async function readTextFileIfExists(path) {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch {
    return '';
  }
}

async function listSubscriptionSources() {
  await migrateManualSubscriptionSources();
  try {
    return await runFetcherJson(['--list-sources-json']);
  } catch {
    const recentRun = await readJsonFileIfExists(TG_FETCHER_STATE_FILE, {});
    const manualSources = await loadManualSubscriptionSources();
    return {
      sources: manualSources.map((source) => ({
        ...source,
        kind: 'manual',
        editable: true,
        method: '本地管理页手动订阅源',
        title: source.name,
        lastCount: recentRun?.source_counts?.[source.name] ?? null,
      })),
      fetchProxy: await readTextFileIfExists(SUB_FETCH_PROXY_FILE),
      recentRun,
      execution: [
        '每天 08:00 由 LaunchAgent 执行 tg_node_fetcher.py。',
        '订阅链接和手动单节点进入所属节点池后，均由 Clash Verge 本机核心严格实测。',
        '五湖四海私有池进入 /wuhusihai 和 /wuhusihai-raw。',
      ],
    };
  }
}

function manualNodeForResponse(node = {}) {
  return {
    ...node,
    kind: 'manual-node',
    editable: true,
    title: node.name,
    preview: nodeEndpointPreview(node.uri),
    method: '本地管理页手动单节点（进入所属池后 Clash Verge 实测）',
  };
}

async function listManualNodes() {
  const nodes = await loadManualNodes();
  return {
    nodes: nodes.map(manualNodeForResponse),
  };
}

// Cloudflare REST API 函数
async function cfKvGet(key, env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID;

  if (!apiToken) {
    return null; // 回退到 wrangler
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`CF API error: ${response.status} ${await response.text()}`);
  }

  return await response.text();
}

async function cfKvPut(key, value, env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID;

  if (!apiToken) {
    return null; // 回退到 wrangler
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'text/plain',
      },
      body: value,
    }
  );

  if (!response.ok) {
    throw new Error(`CF API error: ${response.status} ${await response.text()}`);
  }

  return true;
}

async function cfKvDelete(key, env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID;

  if (!apiToken) {
    return null; // 回退到 wrangler
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`CF API error: ${response.status} ${await response.text()}`);
  }

  return true;
}

async function cfKvList(env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID;

  if (!apiToken) {
    return null; // 回退到 wrangler
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?limit=1000`,
    {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`CF API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.result.map(item => ({ name: item.name }));
}

async function cfKvBulkGet(keys, env = process.env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID;

  if (!apiToken) {
    return null;
  }

  const records = [];
  for (let index = 0; index < keys.length; index += 100) {
    const chunk = keys.slice(index, index + 100);
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk/get`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keys: chunk }),
      }
    );

    if (!response.ok) {
      throw new Error(`CF API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const values = data?.result?.values || {};
    for (const key of chunk) {
      const rawValue = values[key];
      const value = rawValue && typeof rawValue === 'object' && 'value' in rawValue
        ? rawValue.value
        : rawValue;
      try {
        records.push({
          name: key,
          value: JSON.parse(value || '{}'),
        });
      } catch (error) {
        console.warn(`[WARN] Failed to parse KV item ${key}:`, error.message);
      }
    }
  }
  return records;
}

// 并发控制工具函数
async function parallelLimit(tasks, limit) {
  const results = [];
  const executing = [];

  for (const [index, task] of tasks.entries()) {
    const promise = Promise.resolve().then(() => task()).then(result => {
      results[index] = result;
      return result;
    });

    results.push(promise);

    if (limit <= tasks.length) {
      const executing_promise = promise.then(() => executing.splice(executing.indexOf(executing_promise), 1));
      executing.push(executing_promise);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  await Promise.all(results);
  return results;
}

async function listUsers(env = process.env) {
  // 优先使用 Cloudflare REST API
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  if (apiToken) {
    try {
      const listed = await cfKvList(env);
      const tokenItems = listed.filter((item) => item?.name?.startsWith(TOKEN_PREFIX));

      if (tokenItems.length === 0) {
        return [];
      }

      const records = await cfKvBulkGet(tokenItems.map((item) => item.name), env);

      return listUsersFromRecords(records.filter(Boolean));
    } catch (error) {
      console.warn('[WARN] CF API failed, falling back to wrangler:', error.message);
      console.warn('[WARN] Stack:', error.stack);
    }
  }

  // 回退到 wrangler
  const listed = parseWranglerJson(await runWranglerJson(['kv', 'key', 'list', '--binding', 'SUB_TOKENS', '--remote']));
  const tokenItems = listed.filter((item) => item?.name?.startsWith(TOKEN_PREFIX));

  if (tokenItems.length === 0) {
    return [];
  }

  // 使用 bulk get 批量获取所有用户数据
  const tempDir = mkdtempSync(join(tmpdir(), 'sub-users-'));
  const keysFile = join(tempDir, 'keys.json');

  try {
    // 写入 keys 文件
    writeFileSync(keysFile, JSON.stringify(tokenItems.map(item => item.name)));

    // 执行 bulk get
    const result = spawnSync('wrangler', buildWranglerArgs(['kv', 'bulk', 'get', keysFile, '--binding', 'SUB_TOKENS', '--remote']), {
      cwd: SUB_STORE_WORKER_DIR,
      env: buildChildEnv(),
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      // 如果 bulk get 失败，回退到并发模式
      console.warn('[WARN] bulk get failed, falling back to parallel mode:', result.stderr);
      const records = await parallelLimit(
        tokenItems.map((item) => async () => {
          const raw = await runWranglerJson(['kv', 'key', 'get', item.name, '--binding', 'SUB_TOKENS', '--remote', '--text']);
          return {
            name: item.name,
            value: JSON.parse(raw.trim() || '{}'),
          };
        }),
        5
      );
      return listUsersFromRecords(records);
    }

    // 解析 bulk get 输出
    // wrangler 返回的是 {key: stringifiedJsonValue} 对象，不是数组
    const bulkObject = parseWranglerJson(result.stdout);
    const records = Object.entries(bulkObject).map(([key, value]) => {
      let parsed = {};
      try {
        parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      } catch (err) {
        console.warn(`[WARN] Failed to parse value for ${key}:`, err.message);
      }
      return { name: key, value: parsed };
    });

    return listUsersFromRecords(records);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function handleApi(request, pathname, env = process.env) {
  if (pathname === '/api/users' && request.method === 'GET') {
    return jsonResponse({ users: await listUsers(env) });
  }
  if (pathname === '/api/subscription-sources' && request.method === 'GET') {
    return jsonResponse(await listSubscriptionSources());
  }
  if (pathname === '/api/manual-nodes' && request.method === 'GET') {
    return jsonResponse(await listManualNodes());
  }
  if (pathname === '/api/alma-runs' && request.method === 'GET') {
    return jsonResponse(await listAlmaRuns(new URL(request.url).searchParams));
  }

  const body = await readJson(request);
  if (pathname === '/api/manual-nodes' && request.method === 'POST') {
    const nodes = await loadManualNodes();
    const nextNode = validateManualNodeInput(body);
    const updated = upsertManualNode(nodes, nextNode);
    await saveManualNodes(updated);
    return jsonResponse({ node: manualNodeForResponse(nextNode), nodes: updated.map(manualNodeForResponse) });
  }

  if (pathname === '/api/manual-nodes/update' && request.method === 'POST') {
    const nodes = await loadManualNodes();
    const nextNode = validateManualNodeInput(body);
    if (!nodes.some((node) => node.id === nextNode.id)) {
      throw new Error('Manual node not found');
    }
    const updated = upsertManualNode(nodes, nextNode);
    await saveManualNodes(updated);
    return jsonResponse({ node: manualNodeForResponse(nextNode), nodes: updated.map(manualNodeForResponse) });
  }

  if (pathname === '/api/manual-nodes/delete' && request.method === 'POST') {
    const nodes = await loadManualNodes();
    const updated = deleteManualNode(nodes, body.id);
    await saveManualNodes(updated);
    return jsonResponse({ deleted: true, nodes: updated.map(manualNodeForResponse) });
  }

  if (pathname === '/api/subscription-sources' && request.method === 'POST') {
    const sources = await loadManualSubscriptionSources();
    const nextSource = validateSubscriptionSourceInput(body);
    const updated = upsertManualSubscriptionSource(sources, nextSource);
    await saveManualSubscriptionSources(updated);
    return jsonResponse({ source: nextSource, sources: updated });
  }

  if (pathname === '/api/subscription-sources/update' && request.method === 'POST') {
    const sources = await loadManualSubscriptionSources();
    const nextSource = validateSubscriptionSourceInput(body);
    if (!sources.some((source) => source.id === nextSource.id)) {
      throw new Error('Subscription source not found');
    }
    const updated = upsertManualSubscriptionSource(sources, nextSource);
    await saveManualSubscriptionSources(updated);
    return jsonResponse({ source: nextSource, sources: updated });
  }

  if (pathname === '/api/subscription-sources/delete' && request.method === 'POST') {
    const sources = await loadManualSubscriptionSources();
    const updated = deleteManualSubscriptionSource(sources, body.id);
    await saveManualSubscriptionSources(updated);
    return jsonResponse({ deleted: true, sources: updated });
  }

  if (pathname === '/api/subscription-sources/test' && request.method === 'POST') {
    const sources = await loadManualSubscriptionSources();
    const source = body.id
      ? sources.find((item) => item.id === validateSourceId(body.id))
      : validateSubscriptionSourceInput(body);
    if (!source) {
      throw new Error('Subscription source not found');
    }
    const result = await runFetcherJson(['--test-source-json', '--url', source.url]);
    return jsonResponse({ source, result });
  }

  if (pathname === '/api/users' && request.method === 'POST') {
    const label = validateLabel(body.label);
    const result = await fastTokenAdd(label);
    return jsonResponse(result);
  }

  if (pathname === '/api/users/disable' && request.method === 'POST') {
    const token = validateToken(body.token);
    const updates = { status: 'disabled' };
    if (body.label) {
      updates.label = validateLabel(body.label);
    }
    const result = await fastTokenUpdate(token, updates);
    return jsonResponse(result);
  }

  if (pathname === '/api/users/enable' && request.method === 'POST') {
    const token = validateToken(body.token);
    const updates = { status: 'active' };
    if (body.label) {
      updates.label = validateLabel(body.label);
    }
    const result = await fastTokenUpdate(token, updates);
    return jsonResponse(result);
  }

  if (pathname === '/api/users/delete' && request.method === 'POST') {
    const tokens = validateTokenList(body.tokens || body.token);
    const deleted = [];
    for (const token of tokens) {
      const result = await fastTokenDelete(token);
      deleted.push(result);
    }
    return jsonResponse({ deleted });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

async function handleRequest(request, env = process.env) {
  const url = new URL(request.url);
  try {
    if (!isAllowedLocalAdminRequest(request, url, env)) {
      // 调试日志
      console.error('[DEBUG] Access denied:', {
        hostname: url.hostname,
        method: request.method,
        pathname: url.pathname,
        publicOrigin: configuredPublicAdminOrigin(env)?.href,
        allowedEmails: String(env.SUB_STORE_ADMIN_ALLOWED_EMAILS || ''),
        headers: {
          origin: request.headers.get('origin'),
          cookie: request.headers.get('cookie')?.substring(0, 100),
          cfAccessEmail: request.headers.get('cf-access-authenticated-user-email'),
          cfAccessJwt: request.headers.get('cf-access-jwt-assertion')?.substring(0, 50),
        }
      });
      return jsonResponse({ error: 'Local access only' }, 403);
    }

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(request, url.pathname, env);
    }

    if (url.pathname === '/sub-store/users') {
      return new Response(null, {
        status: 302,
        headers: { Location: '/sub-store/admin.html#users' },
      });
    }
    if (url.pathname === '/sub-store/sources') {
      return new Response(null, {
        status: 302,
        headers: { Location: '/sub-store/admin.html#sources' },
      });
    }

    if (url.pathname === '/sub-store/admin.html' || url.pathname === '/sub-store/admin-ui.mjs') {
      const file = url.pathname.endsWith('.mjs') ? 'admin-ui.mjs' : 'admin.html';
      const contentTypes = {
        'admin.html': 'text/html; charset=utf-8',
        'admin-ui.mjs': 'text/javascript; charset=utf-8',
      };
      return new Response(await readFile(join(SUB_STORE_ADMIN_DIR, file)), {
        headers: {
          'Content-Type': contentTypes[file],
          'Cache-Control': 'no-store',
        },
      });
    }

    if (url.pathname === '/sub-store/admin-app.css') {
      return new Response(await readFile(join(SUB_STORE_ADMIN_DIR, 'admin-app.css')), {
        headers: {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (url.pathname === '/ui/macos-shell.css') {
      return new Response(await readFile(join(UI_DIR, 'macos-shell.css')), {
        headers: {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const assetPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    if (assetPath.includes('..')) {
      return new Response('Not Found', { status: 404 });
    }
    const extension = assetPath.split('.').pop() || 'html';
    const contentTypes = {
      css: 'text/css; charset=utf-8',
      html: 'text/html; charset=utf-8',
      js: 'text/javascript; charset=utf-8',
      json: 'application/json; charset=utf-8',
      map: 'application/json; charset=utf-8',
      svg: 'image/svg+xml',
    };
    const filePath = join(DIST_DIR, assetPath);
    return new Response(await readFile(filePath), {
      headers: {
        'Content-Type': contentTypes[extension] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[ERROR] handleRequest failed for', url.pathname, ':', error.message);
    console.error('[ERROR] Stack:', error.stack);
    return jsonResponse({ error: error.message }, 400);
  }
}

export function createAdminServer(options = {}) {
  const env = options.env || process.env;
  return createServer(async (nodeRequest, nodeResponse) => {
    const request = new Request(`http://${nodeRequest.headers.host}${nodeRequest.url}`, {
      method: nodeRequest.method,
      headers: nodeRequest.headers,
      body: ['GET', 'HEAD'].includes(nodeRequest.method) ? undefined : nodeRequest,
      duplex: 'half',
    });
    const response = await handleRequest(request, env);
    nodeResponse.writeHead(response.status, Object.fromEntries(response.headers));
    if (nodeRequest.method === 'HEAD') {
      nodeResponse.end();
      return;
    }
    nodeResponse.end(Buffer.from(await response.arrayBuffer()));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;
  createAdminServer().listen(port, host, () => {
    console.log(`Sub Store 管理页面已启动: http://${host}:${port}`);
    const publicOrigin = configuredPublicAdminOrigin(process.env);
    if (publicOrigin) {
      console.log(`允许 Cloudflare Tunnel 管理入口: ${normalizedOrigin(publicOrigin)}`);
      console.log('公网入口必须经过 Cloudflare Access，并由 cloudflared 指向本机服务。');
    } else {
      console.log('这个服务只监听本机，不会公开到外网。');
    }
  });
}
