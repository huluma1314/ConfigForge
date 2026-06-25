#!/bin/bash
# Sub Store Admin Server 启动脚本
# 支持 Cloudflare Tunnel 公网访问

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "错误: 未找到环境变量文件 $ENV_FILE"
  echo "请从模板创建并填入真实值:"
  echo "  cp .env.example .env.local"
  echo "  # 编辑 .env.local 填入你的 Cloudflare 凭证"
  exit 1
fi

# 加载环境变量
set -a
source "$ENV_FILE"
set +a

# 验证必需的环境变量
REQUIRED_VARS=(
  "CLOUDFLARE_API_TOKEN"
  "CLOUDFLARE_ACCOUNT_ID"
  "CLOUDFLARE_KV_NAMESPACE_ID"
  "SUB_STORE_ADMIN_PUBLIC_ORIGIN"
  "SUB_STORE_ADMIN_ALLOWED_EMAILS"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "错误: 环境变量 $var 未设置"
    echo "请检查 $ENV_FILE"
    exit 1
  fi
done

# 调试：打印非敏感环境变量
echo "启动环境变量："
echo "PORT=${PORT:-8789}"
echo "HOST=${HOST:-127.0.0.1}"
echo "SUB_STORE_ADMIN_PUBLIC_ORIGIN=$SUB_STORE_ADMIN_PUBLIC_ORIGIN"
echo "SUB_STORE_ADMIN_ALLOWED_EMAILS=$SUB_STORE_ADMIN_ALLOWED_EMAILS"
echo ""

cd "$PROJECT_ROOT"
node scripts/sub-store-admin-server.mjs
