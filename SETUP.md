# Sub Store Admin 配置指南

本项目的 Sub Store Admin 功能需要 Cloudflare 凭证才能运行。为避免密钥泄露，真实配置文件已列入 `.gitignore`，你需要从模板创建本地配置。

## 快速开始

### 1. 创建环境变量文件

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入你的真实值：

```bash
# Cloudflare API 凭证
CLOUDFLARE_API_TOKEN=your_token_here          # 从 Cloudflare Dashboard 创建
CLOUDFLARE_ACCOUNT_ID=your_account_id         # 在 Workers & Pages 页面找到
CLOUDFLARE_KV_NAMESPACE_ID=your_kv_id         # wrangler kv:namespace list

# 公网访问配置（如果通过 Cloudflare Tunnel）
SUB_STORE_ADMIN_PUBLIC_ORIGIN=https://subadmin.example.com
SUB_STORE_ADMIN_ALLOWED_EMAILS=your-email@example.com
```

### 2. 创建 Wrangler 配置（如果需要部署 Worker）

```bash
cd sub-store-worker
cp wrangler.admin.toml.example wrangler.admin.toml
cp wrangler.toml.example wrangler.toml
```

编辑两个 toml 文件，把 `YOUR_KV_NAMESPACE_ID_HERE` 替换为你的真实 Namespace ID。

### 3. 启动服务

```bash
bash scripts/start-sub-store-admin.sh
```

启动脚本会自动从 `.env.local` 加载环境变量，并验证必需的配置项。

## 获取 Cloudflare 凭证

### API Token

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **My Profile** → **API Tokens**
3. 点击 **Create Token**
4. 选择 **Edit Cloudflare Workers** 模板，或自定义权限：
   - Account - Workers KV Storage - Edit
   - Account - Workers Scripts - Edit
5. 生成后复制到 `.env.local` 的 `CLOUDFLARE_API_TOKEN`

### Account ID

在 Workers & Pages 页面右侧可以找到 Account ID。

### KV Namespace ID

```bash
# 先登录
wrangler login

# 列出所有 KV Namespace
wrangler kv:namespace list

# 或创建新的
wrangler kv:namespace create SUB_TOKENS
```

## 注意事项

- ⚠️ **切勿提交** `.env.local`、`wrangler.toml`、`wrangler.admin.toml` 到 Git
- 这些文件已在 `.gitignore` 中，但推送前务必再次确认
- 如果你的启动脚本仍有硬编码密钥，它也已列入 `.gitignore`
- API Token 具有完整的 Workers 和 KV 写权限，务必妥善保管

## 文件说明

| 文件 | 说明 | 是否提交 |
|------|------|----------|
| `.env.example` | 环境变量模板 | ✅ 提交（无密钥） |
| `.env.local` | 你的真实环境变量 | ❌ 不提交 |
| `wrangler.*.toml.example` | Wrangler 配置模板 | ✅ 提交（占位符） |
| `wrangler.*.toml` | 你的真实 Wrangler 配置 | ❌ 不提交 |
| `scripts/start-sub-store-admin.sh` | 启动脚本 | ❌ 不提交（防止误传历史密钥） |
