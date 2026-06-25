import "./styles.css";
import { transformConfig } from "./app";
import type { ConfigFormat } from "./domain/types";
import {
  transformSubscription,
  SUBSCRIPTION_CONVERTER_BACKENDS,
  DEFAULT_SUBSCRIPTION_CONVERTER_BASE_URL,
  type SubscriptionOutputMode,
  type SubscriptionTargetFormat
} from "./subscription";
import { initSourceWorkbench, renderSourceWorkbenchMarkup } from "./source-workbench";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function getDownloadName(format: ConfigFormat): string {
  switch (format) {
    case "qx":
      return "configforge-output-qx.conf";
    case "surge":
      return "configforge-output-surge.conf";
    case "surfboard":
      return "configforge-output-surfboard.conf";
    case "clash":
      return "configforge-output-clash.yaml";
    case "sing-box":
      return "configforge-output-singbox.json";
  }
}

function getSubscriptionModeLabel(mode: string): string {
  return mode === "url" ? "订阅链接" : "订阅内容";
}

function getSubscriptionOutputModeLabel(mode: string): string {
  return mode === "link" ? "转换链接" : "文件内容";
}

function getSubscriptionPipelineLabel(pipeline: string): string {
  switch (pipeline) {
    case "backend-link":
      return "后端转换链接";
    case "full-config":
      return "完整配置转换";
    case "node-subscription":
      return "节点订阅转换";
    default:
      return pipeline;
  }
}

function renderSubscriptionTargetOptions(): string {
  return [
    { value: "qx", label: "Quantumult X" },
    { value: "surge", label: "Surge" },
    { value: "surfboard", label: "Surfboard" },
    { value: "clash", label: "Clash" },
    { value: "sing-box", label: "sing-box" },
    { value: "uri-list", label: "URI 列表" },
    { value: "base64-uri", label: "Base64 URI" }
  ]
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function renderLogItems(items: string[]): string {
  if (items.length === 0) {
    return `<p class="empty-copy">暂无过程日志</p>`;
  }

  return items
    .map((item) => {
      const tone = item.includes("失败")
        ? "danger"
        : item.includes("已拉取") || item.includes("已并入") || item.includes("生成完成")
          ? "success"
          : item.includes("检测结果") || item.includes("解析完成")
            ? "info"
            : "neutral";
      return `<span class="log-pill ${tone}">${escapeHtml(item)}</span>`;
    })
    .join("");
}

function renderWarnings(
  warnings: Array<{ level: string; message: string }>,
  emptyText = "未发现需要提示的降级项。"
): string {
  if (warnings.length === 0) {
    return `<p class="empty-copy">${escapeHtml(emptyText)}</p>`;
  }

  return warnings
    .map((item) => {
      const tone =
        item.level === "limitation"
          ? "danger"
          : item.level === "dropped"
            ? "warn"
            : item.level === "approximate"
              ? "info"
              : "neutral";
      const label =
        item.level === "limitation"
          ? "限制"
          : item.level === "dropped"
            ? "已忽略"
            : item.level === "approximate"
              ? "近似"
              : "提示";
      return `
        <article class="warning-card ${tone}">
          <strong>${label}</strong>
          <p>${escapeHtml(item.message)}</p>
        </article>
      `;
    })
    .join("");
}

function renderStatusSummary(
  detected: { format?: string; confidence: number },
  validationLabel: string,
  remoteLabel: string
): string {
  return `
    <div class="status-summary">
      <article class="summary-chip">
        <span>识别结果</span>
        <strong>${escapeHtml(detected.format ?? "未知")} · ${Math.round(detected.confidence * 100)}%</strong>
      </article>
      <article class="summary-chip">
        <span>输出校验</span>
        <strong>${escapeHtml(validationLabel)}</strong>
      </article>
      <article class="summary-chip wide">
        <span>远程资源</span>
        <strong>${escapeHtml(remoteLabel)}</strong>
      </article>
    </div>
  `;
}

const ICON_SUN = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const ICON_MOON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const ICON_BOLT = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>`;
const ICON_FILE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const ICON_ARROW = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const ICON_COPY = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const THEME_STORAGE_KEY = "configforge-theme";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("缺少应用挂载点");
}

app.innerHTML = `
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand">
        <span class="brand-mark">${ICON_BOLT}</span>
        <span class="brand-text">
          <span class="brand-name">ConfigForge</span>
          <span class="brand-tag">配置转换工具台</span>
        </span>
      </div>
      <nav class="side-nav" aria-label="转换模式">
        <button id="config-tab" class="nav-item active" type="button">
          <span class="nav-icon">↔</span>
          <span>快速转换</span>
        </button>
        <button id="source-tab" class="nav-item" type="button">
          <span class="nav-icon">▦</span>
          <span>来源库</span>
        </button>
        <button id="subscription-tab" class="nav-item" type="button">
          <span class="nav-icon">⛓</span>
          <span>订阅转换</span>
        </button>
        <a class="nav-item" href="/sub-store/admin.html#users">
          <span class="nav-icon">U</span>
          <span>用户管理</span>
        </a>
        <a class="nav-item" href="/sub-store/admin.html#sources">
          <span class="nav-icon">S</span>
          <span>订阅源管理</span>
        </a>
      </nav>
      <div class="sidebar-card">
        <strong>本地优先</strong>
        <span>完整配置转换在浏览器内完成；远程订阅转换只在你选择后端时使用。</span>
      </div>
      <div class="sidebar-footer">
        <div class="format-pills">
          <span class="pill pill-qx">QX</span>
          <span class="pill pill-surge">Surge</span>
          <span class="pill pill-clash">Clash</span>
        </div>
        <button id="theme-toggle" class="icon-btn" type="button" aria-label="切换深浅主题">
          <span class="icon-sun">${ICON_SUN}</span>
          <span class="icon-moon">${ICON_MOON}</span>
        </button>
      </div>
    </aside>

    <div class="app-main">

    <main id="config-workbench" class="workbench active">
      <section class="page-heading compact-heading">
        <div>
          <p class="workspace-kicker">快速转换</p>
          <h1 class="workspace-title">完整配置转换</h1>
          <p class="workspace-description">粘贴或导入配置，选择目标格式后直接转换。</p>
        </div>
        <div class="status-strip" aria-label="转换能力">
          <span class="status-chip success">本地运行</span>
          <span class="status-chip">自动识别</span>
          <span class="status-chip warning">远程规则可选</span>
        </div>
      </section>
      <section class="toolbar component-toolbar">
        <div class="field component-mode-field">
          <span class="field-label">工作流</span>
          <span class="segmented-control" aria-label="当前工作流">
            <span class="active">配置</span>
            <span>订阅</span>
            <span>来源</span>
          </span>
        </div>
        <label class="field">
          <span class="field-label">源格式</span>
          <select id="source-format">
            <option value="">自动检测</option>
            <option value="qx">Quantumult X</option>
            <option value="surge">Surge</option>
            <option value="surfboard">Surfboard</option>
            <option value="clash">Clash</option>
            <option value="sing-box">sing-box</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">目标格式</span>
          <select id="target-format">
            <option value="clash">Clash</option>
            <option value="sing-box">sing-box</option>
            <option value="surge">Surge</option>
            <option value="surfboard">Surfboard</option>
            <option value="qx">Quantumult X</option>
          </select>
        </label>
        <label class="field file-field">
          <span class="field-label">本地文件</span>
          <input type="file" id="file-input" accept=".conf,.yaml,.yml,.txt,.config" />
          <span class="file-display"><span class="file-icon">${ICON_FILE}</span><span class="file-text">选择文件…</span></span>
        </label>
        <label class="field toggle-field">
          <span class="toggle-copy">
            <span class="field-label">展开远程规则</span>
            <small>拉取 rule-provider / policy-path 并入输出</small>
          </span>
          <input type="checkbox" id="expand-remote-rules" />
        </label>
      </section>

      <section class="editors quick-convert-editors">
        <article class="editor">
          <header class="editor-head">
            <div class="editor-title">
              <span class="dot dot-input"></span>
              <h2>输入</h2>
              <span class="hint">粘贴配置或选择本地文件</span>
            </div>
            <div class="editor-badges">
              <span class="editor-badge">自动识别</span>
              <span class="editor-badge">多格式兼容</span>
            </div>
          </header>
          <textarea id="input-text" placeholder="粘贴 Quantumult X / Surge / Clash 配置内容..." spellcheck="false"></textarea>
        </article>
        <div class="convert-action">
          <button id="transform-button" class="primary-btn" type="button">
            <span>开始转换</span>${ICON_ARROW}
          </button>
        </div>
        <article class="editor">
          <header class="editor-head">
            <div class="editor-title">
              <span class="dot dot-output"></span>
              <h2>输出</h2>
              <span class="hint">转换结果</span>
            </div>
            <div class="editor-tools">
              <div class="editor-badges">
                <span class="editor-badge">可复制</span>
                <span class="editor-badge">可下载</span>
              </div>
              <div class="actions">
              <button id="copy-button" class="ghost-btn" type="button">${ICON_COPY}<span>复制</span></button>
              <button id="download-button" class="ghost-btn" type="button">${ICON_DOWNLOAD}<span>下载</span></button>
              </div>
            </div>
          </header>
          <textarea id="output-text" readonly placeholder="转换结果将显示在这里..." spellcheck="false"></textarea>
        </article>
      </section>

      <section class="drawer" id="config-drawer">
        <div class="drawer-head">
          <nav class="drawer-tabs" data-drawer="config">
            <button class="drawer-tab active" data-pane="status" type="button">状态</button>
            <button class="drawer-tab" data-pane="log" type="button">日志</button>
            <button class="drawer-tab" data-pane="notes" type="button">注意事项</button>
          </nav>
          <button class="drawer-toggle" data-drawer="config" type="button" aria-label="折叠面板">${ICON_CHEVRON}</button>
        </div>
        <div class="drawer-body">
          <div class="drawer-pane active" data-pane="status">
            <div id="status-box" class="status-box">
              <p class="empty-copy">等待转换…</p>
            </div>
          </div>
          <div class="drawer-pane" data-pane="log">
            <div id="log-box" class="log-box">
              <p class="empty-copy">暂无过程日志</p>
            </div>
          </div>
          <div class="drawer-pane" data-pane="notes">
            <div id="notes-box" class="notes-box">
              <p class="empty-copy">转换注意事项将显示在这里</p>
            </div>
          </div>
        </div>
      </section>
      <details class="worker-settings">
        <summary>订阅发布设置</summary>
        <div class="worker-settings-body">
          <label class="field">
            <span class="field-label">Worker URL</span>
            <input type="url" id="worker-url" placeholder="https://configforge-sub.xxx.workers.dev" />
          </label>
          <label class="field">
            <span class="field-label">Token</span>
            <input type="text" id="worker-token" placeholder="部署时生成的 AUTH_TOKEN" />
          </label>
          <button id="publish-button" class="ghost-btn" type="button">${ICON_ARROW}<span>发布订阅</span></button>
          <p class="hint" style="margin:0;font-size:0.75rem;opacity:0.7">首次部署运行 <code>bash worker/deploy.sh</code>，之后在这里上传即可</p>
        </div>
      </details>
    </main>

    <main id="subscription-workbench" class="workbench">
      <section class="page-heading compact-heading">
        <div>
          <p class="workspace-kicker">订阅链接转换</p>
          <h1 class="workspace-title">订阅转换</h1>
          <p class="workspace-description">输入订阅链接或内容，输出文件内容、URI 列表或后端转换链接。</p>
        </div>
        <div class="status-strip" aria-label="订阅转换能力">
          <span class="status-chip">链接 / 内容</span>
          <span class="status-chip success">文件 / 链接</span>
          <span class="status-chip">多目标格式</span>
        </div>
      </section>
      <section class="toolbar component-toolbar">
        <div class="field component-mode-field">
          <span class="field-label">交付方式</span>
          <span class="segmented-control" aria-label="订阅交付方式">
            <span class="active">内容</span>
            <span>链接</span>
            <span>URI</span>
          </span>
        </div>
        <label class="field">
          <span class="field-label">输入方式</span>
          <select id="subscription-input-mode">
            <option value="url">订阅链接</option>
            <option value="text">订阅内容</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">目标格式</span>
          <select id="subscription-target-format">
            ${renderSubscriptionTargetOptions()}
          </select>
        </label>
        <label class="field">
          <span class="field-label">输出方式</span>
          <select id="subscription-output-mode">
            <option value="content">文件内容</option>
            <option value="link">转换链接</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">后端地址</span>
          <select id="subscription-backend">
            <option value="">默认</option>
            ${SUBSCRIPTION_CONVERTER_BACKENDS.map((b) => `<option value="${escapeHtml(b.value)}">${escapeHtml(b.label)}</option>`).join("")}
          </select>
        </label>
        <button id="subscription-transform-button" class="primary-btn" type="button">
          <span>转换订阅</span>${ICON_ARROW}
        </button>
      </section>

      <section class="editors">
        <article class="editor">
          <header class="editor-head">
            <div class="editor-title">
              <span class="dot dot-input"></span>
              <h2>订阅输入</h2>
              <span class="hint">链接或原始内容</span>
            </div>
            <div class="editor-badges">
              <span class="editor-badge">批量链接</span>
              <span class="editor-badge">内容直转</span>
            </div>
          </header>
          <textarea id="subscription-input-text" placeholder="输入订阅链接或订阅内容..." spellcheck="false"></textarea>
        </article>
        <article class="editor">
          <header class="editor-head">
            <div class="editor-title">
              <span class="dot dot-output"></span>
              <h2>订阅输出</h2>
              <span class="hint">转换结果</span>
            </div>
            <div class="editor-tools">
              <div class="editor-badges">
                <span class="editor-badge">快速导出</span>
                <span class="editor-badge">后端兼容</span>
              </div>
              <div class="actions">
              <button id="subscription-copy-button" class="ghost-btn" type="button">${ICON_COPY}<span>复制</span></button>
              <button id="subscription-download-button" class="ghost-btn" type="button">${ICON_DOWNLOAD}<span>下载</span></button>
              </div>
            </div>
          </header>
          <textarea id="subscription-output-text" readonly placeholder="订阅转换结果将显示在这里..." spellcheck="false"></textarea>
        </article>
      </section>

      <section class="drawer" id="subscription-drawer">
        <div class="drawer-head">
          <nav class="drawer-tabs" data-drawer="subscription">
            <button class="drawer-tab active" data-pane="status" type="button">状态</button>
            <button class="drawer-tab" data-pane="log" type="button">日志</button>
            <button class="drawer-tab" data-pane="notes" type="button">注意事项</button>
          </nav>
          <button class="drawer-toggle" data-drawer="subscription" type="button" aria-label="折叠面板">${ICON_CHEVRON}</button>
        </div>
        <div class="drawer-body">
          <div class="drawer-pane active" data-pane="status">
            <div id="subscription-status-box" class="status-box">
              <p class="empty-copy">等待转换…</p>
            </div>
          </div>
          <div class="drawer-pane" data-pane="log">
            <div id="subscription-log-box" class="log-box">
              <p class="empty-copy">暂无过程日志</p>
            </div>
          </div>
          <div class="drawer-pane" data-pane="notes">
            <div id="subscription-notes-box" class="notes-box">
              <p class="empty-copy">订阅转换注意事项将显示在这里</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <main id="source-workbench" class="workbench">
      ${renderSourceWorkbenchMarkup()}
    </main>
    </div>
  </div>
`;

/* ─── DOM References ─── */
const rootEl = document.documentElement;
const themeToggleEl = document.getElementById("theme-toggle") as HTMLButtonElement;

const configTabEl = document.getElementById("config-tab") as HTMLButtonElement;
const subscriptionTabEl = document.getElementById("subscription-tab") as HTMLButtonElement;
const sourceTabEl = document.getElementById("source-tab") as HTMLButtonElement;
const configWorkbenchEl = document.getElementById("config-workbench") as HTMLElement;
const subscriptionWorkbenchEl = document.getElementById("subscription-workbench") as HTMLElement;
const sourceWorkbenchEl = document.getElementById("source-workbench") as HTMLElement;

const sourceFormatEl = document.getElementById("source-format") as HTMLSelectElement;
const targetFormatEl = document.getElementById("target-format") as HTMLSelectElement;
const fileInputEl = document.getElementById("file-input") as HTMLInputElement;
const expandRemoteEl = document.getElementById("expand-remote-rules") as HTMLInputElement;
const transformButtonEl = document.getElementById("transform-button") as HTMLButtonElement;
const inputTextEl = document.getElementById("input-text") as HTMLTextAreaElement;
const outputTextEl = document.getElementById("output-text") as HTMLTextAreaElement;
const statusBoxEl = document.getElementById("status-box") as HTMLDivElement;
const logBoxEl = document.getElementById("log-box") as HTMLDivElement;
const notesBoxEl = document.getElementById("notes-box") as HTMLDivElement;
const copyButtonEl = document.getElementById("copy-button") as HTMLButtonElement;
const downloadButtonEl = document.getElementById("download-button") as HTMLButtonElement;
const publishButtonEl = document.getElementById("publish-button") as HTMLButtonElement;
const workerUrlEl = document.getElementById("worker-url") as HTMLInputElement;
const workerTokenEl = document.getElementById("worker-token") as HTMLInputElement;

const subscriptionInputModeEl = document.getElementById("subscription-input-mode") as HTMLSelectElement;
const subscriptionTargetFormatEl = document.getElementById("subscription-target-format") as HTMLSelectElement;
const subscriptionOutputModeEl = document.getElementById("subscription-output-mode") as HTMLSelectElement;
const subscriptionBackendEl = document.getElementById("subscription-backend") as HTMLSelectElement;
const subscriptionTransformButtonEl = document.getElementById("subscription-transform-button") as HTMLButtonElement;
const subscriptionInputTextEl = document.getElementById("subscription-input-text") as HTMLTextAreaElement;
const subscriptionOutputTextEl = document.getElementById("subscription-output-text") as HTMLTextAreaElement;
const subscriptionStatusBoxEl = document.getElementById("subscription-status-box") as HTMLDivElement;
const subscriptionLogBoxEl = document.getElementById("subscription-log-box") as HTMLDivElement;
const subscriptionNotesBoxEl = document.getElementById("subscription-notes-box") as HTMLDivElement;
const subscriptionCopyButtonEl = document.getElementById("subscription-copy-button") as HTMLButtonElement;
const subscriptionDownloadButtonEl = document.getElementById("subscription-download-button") as HTMLButtonElement;

let latestSubscriptionFileName = "configforge-subscription.txt";

/* ─── Theme Toggle ─── */
function applyTheme(theme: "light" | "dark") {
  rootEl.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

function getInitialTheme(): "light" | "dark" {
  const domTheme = rootEl.getAttribute("data-theme");
  if (domTheme === "light" || domTheme === "dark") {
    return domTheme;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

themeToggleEl.addEventListener("click", () => {
  const next = rootEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

/* ─── Mode Tabs ─── */
function activateWorkbench(mode: "config" | "subscription" | "source") {
  configTabEl.classList.toggle("active", mode === "config");
  subscriptionTabEl.classList.toggle("active", mode === "subscription");
  sourceTabEl.classList.toggle("active", mode === "source");
  configWorkbenchEl.classList.toggle("active", mode === "config");
  subscriptionWorkbenchEl.classList.toggle("active", mode === "subscription");
  sourceWorkbenchEl.classList.toggle("active", mode === "source");
}

configTabEl.addEventListener("click", () => activateWorkbench("config"));
subscriptionTabEl.addEventListener("click", () => activateWorkbench("subscription"));
sourceTabEl.addEventListener("click", () => activateWorkbench("source"));

/* ─── Drawer Tabs & Collapse ─── */
document.querySelectorAll<HTMLElement>(".drawer-tabs").forEach((tabs) => {
  const drawer = tabs.closest(".drawer") as HTMLElement | null;
  if (!drawer) return;
  tabs.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest(".drawer-tab") as HTMLButtonElement | null;
    if (!button) return;
    const pane = button.dataset.pane;
    if (!pane) return;
    tabs.querySelectorAll<HTMLButtonElement>(".drawer-tab").forEach((b) => b.classList.toggle("active", b === button));
    drawer.querySelectorAll<HTMLElement>(".drawer-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === pane));
    drawer.classList.remove("collapsed");
  });
});

document.querySelectorAll<HTMLButtonElement>(".drawer-toggle").forEach((button) => {
  const drawer = button.closest(".drawer") as HTMLElement | null;
  if (!drawer) return;
  button.addEventListener("click", () => {
    drawer.classList.toggle("collapsed");
  });
});

function focusDrawerPane(workbench: HTMLElement, pane: "status" | "log" | "notes") {
  const drawer = workbench.querySelector<HTMLElement>(".drawer");
  if (!drawer) return;
  drawer.classList.remove("collapsed");
  drawer.querySelectorAll<HTMLButtonElement>(".drawer-tab").forEach((b) => b.classList.toggle("active", b.dataset.pane === pane));
  drawer.querySelectorAll<HTMLElement>(".drawer-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === pane));
}

/* ─── File Import ─── */
fileInputEl.addEventListener("change", () => {
  const file = fileInputEl.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    inputTextEl.value = reader.result as string;
    const fileLabel = fileInputEl.parentElement?.querySelector(".file-text");
    if (fileLabel) {
      fileLabel.textContent = file.name;
    }
  };
  reader.readAsText(file);
});

/* ─── Config Transform ─── */
transformButtonEl.addEventListener("click", async () => {
  const input = inputTextEl.value.trim();
  const sourceFormat = (sourceFormatEl.value || undefined) as ConfigFormat | undefined;
  const targetFormat = targetFormatEl.value as ConfigFormat;

  if (!input) {
    statusBoxEl.innerHTML = `<p class="error">请先输入或导入配置内容。</p>`;
    focusDrawerPane(configWorkbenchEl, "status");
    return;
  }

  transformButtonEl.disabled = true;
  transformButtonEl.classList.add("loading");

  const result = await transformConfig(input, {
    sourceFormat,
    targetFormat,
    expandRemoteRules: expandRemoteEl.checked,
    expandRemoteProxies: false
  });

  transformButtonEl.disabled = false;
  transformButtonEl.classList.remove("loading");

  if (!result.parseValidation.valid || !result.output) {
    statusBoxEl.innerHTML = `
      <p>检测结果: ${result.detected.format ?? "未知"} (${Math.round(result.detected.confidence * 100)}%)</p>
      <p class="error">解析失败: ${escapeHtml(result.parseValidation.errors.map((item) => item.message).join("；"))}</p>
    `;
    logBoxEl.innerHTML = renderLogItems(result.log ?? []);
    outputTextEl.value = "";
    notesBoxEl.innerHTML = `<p class="empty-copy">请先修复输入配置格式，然后重新转换。</p>`;
    focusDrawerPane(configWorkbenchEl, "status");
    return;
  }

  outputTextEl.value = result.output.content;
  statusBoxEl.innerHTML = renderStatusSummary(
    result.detected,
    result.output.validation.valid ? "通过" : "失败",
    result.remoteStatus.join("；") || "未展开远程资源，当前保留原始远程引用"
  );
  logBoxEl.innerHTML = renderLogItems(result.log ?? []);
  notesBoxEl.innerHTML = renderWarnings(result.output.warnings);
  focusDrawerPane(configWorkbenchEl, "status");
});

copyButtonEl.addEventListener("click", async () => {
  if (!outputTextEl.value) {
    statusBoxEl.innerHTML = `<p class="empty-copy">当前没有可复制的输出。</p>`;
    focusDrawerPane(configWorkbenchEl, "status");
    return;
  }
  await navigator.clipboard.writeText(outputTextEl.value);
  statusBoxEl.innerHTML = `<p class="success-copy">已复制到剪贴板。</p>`;
  focusDrawerPane(configWorkbenchEl, "status");
});

downloadButtonEl.addEventListener("click", () => {
  if (!outputTextEl.value) {
    statusBoxEl.innerHTML = `<p class="empty-copy">当前没有可下载的输出。</p>`;
    focusDrawerPane(configWorkbenchEl, "status");
    return;
  }
  const format = targetFormatEl.value as ConfigFormat;
  const fileName = getDownloadName(format);
  const blob = new Blob([outputTextEl.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  statusBoxEl.innerHTML = `<p class="success-copy">已导出文件: ${escapeHtml(fileName)}</p>`;
  focusDrawerPane(configWorkbenchEl, "status");
});

/* ─── Publish to Worker ─── */
const WORKER_URL_KEY = "configforge-worker-url";
const WORKER_TOKEN_KEY = "configforge-worker-token";

try {
  workerUrlEl.value = localStorage.getItem(WORKER_URL_KEY) ?? "";
  workerTokenEl.value = localStorage.getItem(WORKER_TOKEN_KEY) ?? "";
} catch {}

publishButtonEl.addEventListener("click", async () => {
  const input = inputTextEl.value.trim();
  if (!input) {
    statusBoxEl.innerHTML = `<p class="error">请先输入配置内容。</p>`;
    focusDrawerPane(configWorkbenchEl, "status");
    return;
  }

  const workerUrl = workerUrlEl.value.trim().replace(/\/+$/, "");
  const workerToken = workerTokenEl.value.trim();
  if (!workerUrl) {
    statusBoxEl.innerHTML = `<p class="error">请先在「订阅发布设置」中填写 Worker URL。</p>`;
    focusDrawerPane(configWorkbenchEl, "status");
    return;
  }

  try {
    localStorage.setItem(WORKER_URL_KEY, workerUrl);
    localStorage.setItem(WORKER_TOKEN_KEY, workerToken);
  } catch {}

  publishButtonEl.disabled = true;
  const targets: ConfigFormat[] = ["sing-box", "clash", "surge", "surfboard", "qx"];
  const formats: Record<string, string> = {};
  const failures: string[] = [];

  try {
    const sourceFormat = (sourceFormatEl.value || undefined) as ConfigFormat | undefined;

    for (const target of targets) {
      statusBoxEl.innerHTML = `<p>正在生成 ${escapeHtml(target)} 格式...</p>`;
      focusDrawerPane(configWorkbenchEl, "status");
      const result = await transformConfig(input, {
        sourceFormat,
        targetFormat: target,
        expandRemoteRules: expandRemoteEl.checked,
        expandRemoteProxies: false
      });
      if (result.output?.content) {
        formats[target] = result.output.content;
      } else {
        failures.push(`${target}: ${result.parseValidation.errors.map((e) => e.message).join("；") || "生成失败"}`);
      }
    }

    if (Object.keys(formats).length === 0) {
      statusBoxEl.innerHTML = `<p class="error">所有格式生成失败：${escapeHtml(failures.join(" | "))}</p>`;
      focusDrawerPane(configWorkbenchEl, "status");
      return;
    }

    statusBoxEl.innerHTML = `<p>正在上传 ${Object.keys(formats).length} 种格式到 Worker...</p>`;
    focusDrawerPane(configWorkbenchEl, "status");

    const resp = await fetch(`${workerUrl}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {})
      },
      body: JSON.stringify({ formats })
    });

    const data = await resp.json();
    if (!resp.ok) {
      statusBoxEl.innerHTML = `<p class="error">上传失败: ${escapeHtml(data.error ?? resp.statusText)}</p>`;
      focusDrawerPane(configWorkbenchEl, "status");
      return;
    }

    const subUrl = workerToken ? `${workerUrl}/sub?token=${workerToken}` : `${workerUrl}/sub`;
    const failureNote = failures.length > 0
      ? `<p class="hint" style="color:var(--warn);font-size:0.75rem;margin-top:0.5rem">部分格式跳过：${escapeHtml(failures.join(" | "))}</p>`
      : "";
    statusBoxEl.innerHTML = `
      <p class="success-copy">配置已发布（${Object.keys(formats).length} 种格式）！订阅链接（自动识别客户端）:</p>
      <p><code style="word-break:break-all;user-select:all">${escapeHtml(subUrl)}</code></p>
      <p class="hint" style="font-size:0.75rem;opacity:0.7;margin-top:0.5rem">
        各客户端直接填此链接即可。手动指定格式: 加 &amp;target=sing-box / clash / surge / qx
      </p>
      ${failureNote}
    `;
    focusDrawerPane(configWorkbenchEl, "status");
  } catch (err) {
    statusBoxEl.innerHTML = `<p class="error">网络错误: ${escapeHtml(err instanceof Error ? err.message : "请求失败")}</p>`;
    focusDrawerPane(configWorkbenchEl, "status");
  } finally {
    publishButtonEl.disabled = false;
  }
});

/* ─── Subscription Transform ─── */
subscriptionTransformButtonEl.addEventListener("click", async () => {
  const input = subscriptionInputTextEl.value.trim();
  const inputMode = subscriptionInputModeEl.value as "url" | "text";
  const targetFormat = subscriptionTargetFormatEl.value as SubscriptionTargetFormat;
  const outputMode = subscriptionOutputModeEl.value as SubscriptionOutputMode;

  if (!input) {
    subscriptionStatusBoxEl.innerHTML = `<p class="error">请输入订阅链接或订阅内容。</p>`;
    focusDrawerPane(subscriptionWorkbenchEl, "status");
    return;
  }

  subscriptionTransformButtonEl.disabled = true;
  subscriptionTransformButtonEl.classList.add("loading");

  const converterBaseUrl = subscriptionBackendEl.value || DEFAULT_SUBSCRIPTION_CONVERTER_BASE_URL;
  const result = await transformSubscription(input, { inputMode, targetFormat, outputMode, converterBaseUrl });

  subscriptionTransformButtonEl.disabled = false;
  subscriptionTransformButtonEl.classList.remove("loading");

  subscriptionOutputTextEl.value = result.content ?? "";
  latestSubscriptionFileName = result.fileName ?? "configforge-subscription.txt";
  subscriptionStatusBoxEl.innerHTML = `
    <div class="status-summary">
      <article class="summary-chip">
        <span>输入类型</span>
        <strong>${getSubscriptionModeLabel(inputMode)}</strong>
      </article>
      <article class="summary-chip">
        <span>节点数量</span>
        <strong>${outputMode === "link" ? "由远程转换" : result.proxies.length}</strong>
      </article>
      <article class="summary-chip">
        <span>转换管线</span>
        <strong>${escapeHtml(getSubscriptionPipelineLabel(result.pipeline))}</strong>
      </article>
      <article class="summary-chip wide">
        <span>输出方式</span>
        <strong>${escapeHtml(getSubscriptionOutputModeLabel(outputMode))} · ${escapeHtml(targetFormat)}</strong>
      </article>
    </div>
  `;
  subscriptionLogBoxEl.innerHTML = renderLogItems(result.log);
  subscriptionNotesBoxEl.innerHTML = renderWarnings(result.warnings, "订阅转换完成。");
  focusDrawerPane(subscriptionWorkbenchEl, "status");
});

subscriptionCopyButtonEl.addEventListener("click", async () => {
  if (!subscriptionOutputTextEl.value) {
    subscriptionStatusBoxEl.innerHTML = `<p class="empty-copy">当前没有可复制的订阅输出。</p>`;
    focusDrawerPane(subscriptionWorkbenchEl, "status");
    return;
  }
  await navigator.clipboard.writeText(subscriptionOutputTextEl.value);
  subscriptionStatusBoxEl.innerHTML = `<p class="success-copy">订阅输出已复制到剪贴板。</p>`;
  focusDrawerPane(subscriptionWorkbenchEl, "status");
});

subscriptionDownloadButtonEl.addEventListener("click", () => {
  if (!subscriptionOutputTextEl.value) {
    subscriptionStatusBoxEl.innerHTML = `<p class="empty-copy">当前没有可下载的订阅输出。</p>`;
    focusDrawerPane(subscriptionWorkbenchEl, "status");
    return;
  }
  const blob = new Blob([subscriptionOutputTextEl.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = latestSubscriptionFileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  subscriptionStatusBoxEl.innerHTML = `<p class="success-copy">已导出文件: ${escapeHtml(latestSubscriptionFileName)}</p>`;
  focusDrawerPane(subscriptionWorkbenchEl, "status");
});

initSourceWorkbench(sourceWorkbenchEl);
activateWorkbench("config");
