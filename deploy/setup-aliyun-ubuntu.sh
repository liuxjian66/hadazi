#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/hadazi"
REPO_URL="${REPO_URL:-https://github.com/liuxjian66/hadazi.git}"
DOMAIN="${DOMAIN:-_}"

echo "==> 更新系统依赖"
sudo apt-get update
sudo apt-get install -y curl git nginx ca-certificates

echo "==> 安装 Node.js 20"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(20|22)\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> 安装 PM2"
sudo npm install -g pm2

echo "==> 拉取 HaDaZi 代码"
sudo mkdir -p "$APP_DIR" /var/log/hadazi
sudo chown -R "$USER":"$USER" "$APP_DIR" /var/log/hadazi
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
npm ci --omit=dev || npm install --omit=dev

echo "==> 写入 .env"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
PORT=3000
SUPABASE_URL=${SUPABASE_URL:-}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-}
EOF
  chmod 600 "$APP_DIR/.env"
  echo "已创建 .env。请确认 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 已填好。"
fi

echo "==> 配置 Nginx"
sudo cp "$APP_DIR/deploy/nginx-hadazi.conf" /etc/nginx/sites-available/hadazi
if [ "$DOMAIN" != "_" ]; then
  sudo sed -i "s/server_name _;/server_name $DOMAIN;/g" /etc/nginx/sites-available/hadazi
fi
sudo ln -sf /etc/nginx/sites-available/hadazi /etc/nginx/sites-enabled/hadazi
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> 启动 PM2"
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" >/tmp/pm2-startup.txt || true
cat /tmp/pm2-startup.txt || true

echo "==> 完成"
echo "访问：http://服务器公网IP/"
echo "健康检查：http://服务器公网IP/api/health"
