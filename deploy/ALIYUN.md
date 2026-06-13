# HaDaZi 阿里云 ECS 部署说明

推荐系统：Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS。

## 服务器准备

阿里云 ECS 安全组需要放行：

- `22`：SSH 登录
- `80`：HTTP 访问
- `443`：HTTPS，绑定域名后使用

如果暂时没有域名，可以先用公网 IP 访问。

## 一键部署

登录服务器后执行：

```bash
git clone https://github.com/liuxjian66/hadazi.git /var/www/hadazi
cd /var/www/hadazi
chmod +x deploy/setup-aliyun-ubuntu.sh
SUPABASE_URL="你的Supabase项目URL" SUPABASE_SERVICE_ROLE_KEY="你的Supabase后端密钥" bash deploy/setup-aliyun-ubuntu.sh
```

部署完成后访问：

```text
http://服务器公网IP/
http://服务器公网IP/api/health
```

如果 `/api/health` 返回 `database: "supabase"`，说明已经连上 Supabase。

## 常用维护命令

查看服务：

```bash
pm2 status
```

查看日志：

```bash
pm2 logs hadazi
```

更新代码：

```bash
cd /var/www/hadazi
git pull
npm install --omit=dev
pm2 restart hadazi
```

重启 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 绑定域名后开启 HTTPS

域名解析到 ECS 公网 IP 后执行：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

完成后用：

```text
https://你的域名/
```

访问 HaDaZi。
