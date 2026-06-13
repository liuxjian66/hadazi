# HaDaZi 大学生搭子交友 App

这是一个可运行的全栈原型，适合继续开发成真实上线的大学生交友产品。项目已支持 Render 部署和 Supabase 云数据库。

## 已有功能

- 独立首页：专门做“匹配朋友”。
- 独立联系人页：所有已添加好友都在联系人页面。
- 独立聊天页：点击联系人后跳转到对应聊天框。
- 独立广场页：体验类似朋友圈的信息流。
- 独立发布页：从广场右上角点击“发布”进入编辑页面，发布后回到广场。
- 独立个人页：支持简历、人格、性别、年龄、星座和出生日期。
- 根据 MBTI 合拍度、共同兴趣、搭子目标、可约时间和星座排序推荐。
- 前端聊天体验，后端提供消息接口，并支持 Socket.IO 实时消息。
- 搜索引擎基础信息已写入页面 `meta`，上线后可被搜索引擎收录。

## 本地运行

1. 安装 Node.js 18 或更高版本。
2. 在本项目目录运行：

```bash
npm install
npm start
```

3. 浏览器打开：

```text
http://localhost:3000
```

## 后端接口

- `GET /api/health`：检查服务是否正常。
- `GET /api/people`：获取推荐候选人。
- `GET /api/posts`：获取广场动态。
- `POST /api/posts`：发布广场动态。
- `GET /api/friends/:userId`：获取用户联系人。
- `POST /api/friends`：添加好友。
- `POST /api/profile`：保存用户资料。
- `GET /api/profile/:id`：获取用户资料。
- `GET /api/matches/:id`：获取匹配排序结果。
- `GET /api/messages/:userId/:personId`：获取聊天记录。
- `POST /api/messages`：发送聊天消息。

后端支持双模式：如果配置了 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，会使用 Supabase；如果没有配置，会自动使用本地 `data/db.json`，方便本地演示。

## Render + Supabase

- `render.yaml`：Render Blueprint 部署配置。
- `.env.example`：本地和 Render 环境变量模板。
- `supabase/schema.sql`：Supabase 建表 SQL。
- `DEPLOY.md`：完整上线步骤。

## 上线建议

推荐先部署到 Render，因为本项目包含 Node.js 后端和 Socket.IO。部署时填写：

- Build Command：`npm install`
- Start Command：`npm start`
- Node Version：`18` 或更高
- Port：平台会自动提供 `PORT` 环境变量，代码已兼容

如果要让用户在互联网上搜索到：

- 购买或绑定一个域名，例如 `hadazi.cn`。
- 部署后给网站配置 HTTPS。
- 在页面标题、描述和内容中保留“HaDaZi、哈搭子、大学生交友、MBTI 匹配、校园搭子”等关键词。
- 提交站点到 Google Search Console、百度搜索资源平台或其他搜索引擎平台。
- 上线隐私政策、用户协议、举报机制和内容安全审核规则。

## 正式产品还需要补充

- 学生身份认证：校园邮箱、学信网、学生证人工审核等。
- 账号系统：手机号、微信、邮箱或学校统一身份登录。
- 数据库：用户、资料、匹配、消息、举报、拉黑等表结构。
- 内容安全：敏感词、图片审核、举报处理、反骚扰策略。
- 合规文件：隐私政策、用户协议、未成年人保护和数据删除机制。
