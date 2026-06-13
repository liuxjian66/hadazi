# HaDaZi 上线部署说明

这份说明用于把 HaDaZi 部署到 Render，并使用 Supabase 作为线上数据库。

## 准备账号

- GitHub：上传代码
- Supabase：创建数据库
- Render：部署 Node.js 后端和前端静态页面

## Supabase 配置

1. 登录 Supabase，新建一个 Project。
2. 打开左侧 `SQL Editor`。
3. 新建查询，复制 `supabase/schema.sql` 的全部内容并运行。
4. 打开 `Project Settings` -> `API`，复制：
   - `Project URL`
   - `service_role secret`

注意：`service_role secret` 只能放在 Render 后端环境变量里，不能写进前端 HTML 或 JS。

## GitHub 上传

在项目目录执行：

```bash
git init
git add .
git commit -m "HaDaZi Render Supabase version"
git branch -M main
git remote add origin 你的GitHub仓库地址
git push -u origin main
```

如果已经有 Git 仓库，只需要：

```bash
git add .
git commit -m "Add Render and Supabase support"
git push
```

## Render 部署

推荐方式：

1. 登录 Render。
2. 点击 `New` -> `Blueprint`。
3. 选择你的 GitHub 仓库。
4. Render 会读取 `render.yaml`。
5. 在环境变量里填写：

```text
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service_role secret
```

也可以用普通 Web Service 方式：

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

部署成功后，Render 会给你一个公网网址，例如：

```text
https://hadazi.onrender.com
```

## 验证是否成功

打开：

```text
https://你的Render网址/api/health
```

如果返回里有：

```json
{
  "ok": true,
  "name": "HaDaZi",
  "database": "supabase"
}
```

说明线上已经连接 Supabase。

如果 `database` 显示 `local-json`，说明 Render 没有填好 Supabase 环境变量。

## 数据说明

当前 Supabase 表采用 `jsonb` 存主要字段，优点是适合原型快速迭代：

- `profiles`：个人资料
- `people`：推荐候选人
- `posts`：广场动态
- `friends`：联系人关系
- `messages`：聊天消息

后续做正式 App 时，可以再把字段拆成更严格的数据库列，并增加登录注册、头像上传、图片存储、举报和后台审核。
