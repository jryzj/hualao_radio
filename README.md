# RadioAI · 赛博朋克 AI 电台

> AI 驱动的 24h 赛博朋克电台 —— 主播人设自动生成脚本 → LLM 审核 → ComfyUI TTS 合成 → WebSocket 实时推流，听众端有弹幕墙 + 完整管理控制台。

---

## 一、项目简介

RadioAI 是一套「**拟人主播 + 实时广播**」系统：

- **主播端**：人设（Persona）+ 主题（Theme）+ ComfyUI TTS 工作流，定义出一个"电台主持人"。Live Engine 按时间表调用 LLM 生成下一段台词，分句送进 ComfyUI 合成语音，再通过独立 WebSocket 服务器扇出给所有听众。
- **听众端**（`/`）：单页应用，含入口动画墙、实时播放器、频谱可视化、留言墙、留言抽屉；适配桌面 / 移动 / 锁屏后台播放。
- **管理端**（`/admin`）：受 HMAC cookie 保护的可视化控制台，管理人设、主题、TTS 工作流、RSS 新闻源、Tavily 搜索、AI 审核规则、留言审核、音频缓冲策略等。

## 二、核心特性

- 🎙️ **实时流式 TTS 广播**：LLM 出句 → ComfyUI OmniVoice 工作流 → WAV/PCM 帧 → WS 扇出，听感接近"直播间"
- 🤖 **AI 审核弹幕**：听众留言经 LLM 二次审核后才上墙，可配置阈值
- 📰 **RSS + Tavily 联网**：自动拉取新闻源做主播谈资，支持实时网页搜索
- 🧑‍🤝‍🧑 **多主播人设 + 多主题切换**：在线热切，无需重启
- 🔒 **锁屏后台播放**：iOS PWA + Android MediaSession + Wake Lock，播放/缓冲期间不熄屏
- 🌐 **跨终端**：桌面、移动、iPad 横屏、小屏 (≤380px) 自适应布局
- 🛡️ **自签 HMAC cookie 鉴权**：admin 路由服务端中间件校验，无需第三方
- 🔌 **WebSocket 解耦**：广播扇出独立进程，方便横向扩展 / 反向代理

## 三、架构总览

```
┌──────────────────────┐    HTTP     ┌─────────────────────┐    WebSocket    ┌──────────────┐
│  Next.js (port 3000) │ ──────────▶ │  ws-server          │ ──────────────▶ │  听众 UI     │
│  - app/ (听众页)      │             │  (8080/8081)         │   /messages     │  /           │
│  - admin/ (管理端)    │ ◀────────── │  - /audio  音频扇出  │   /audio        │              │
│  - api/ (服务端路由)  │  broadcast  │  - /messages 弹幕扇出│                 │              │
│  - proxy.ts (中间件)  │  +token     │  - HTTP 鉴权扇出 API │                 │              │
└──────────┬───────────┘             └─────────────────────┘                 └──────────────┘
           │                                       ▲
           │ Prisma                                │ HTTP callback
           ▼                                       │
┌──────────────────────┐            ┌──────────────┴────────────────────────────┐
│  SQLite (dev.db)     │            │  外部服务                                     │
│  - 全量业务配置       │            │  - LLM（OpenAI 兼容 API）                    │
│  - 工作流 JSON        │            │  - ComfyUI + OmniVoice TTS（自托管）         │
│  - 留言 / 审核 / 新闻 │            │  - Tavily 联网搜索（可选）                    │
└──────────────────────┘            └────────────────────────────────────────────┘
```

| 进程                        | 端口                          | 角色                            | 启动方式                        |
| ------------------------- | --------------------------- | ----------------------------- | --------------------------- |
| `next dev` / `next start` | `3000`                      | 听众页 + 管理端 + API + 中间件         | `npm run dev` / `npm start` |
| `tsx ws-server/index.ts`  | `8080` (WS) + `8081` (HTTP) | WebSocket 扇出 + 内部 HTTP 广播 API | `npm run ws-server`         |

> ⚠️ **必须双进程运行** —— Next.js 不会自己起 WebSocket。广播链路：Next 进程 → fetch 127.0.0.1:8081（带 token）→ ws-server → 推给所有浏览器 WS 客户端。

## 四、技术栈

### 4.1 框架与运行时

| 项          | 版本       | 备注                                                         |
| ---------- | -------- | ---------------------------------------------------------- |
| Next.js    | `16.2.6` | App Router，**不是 15**；改结构前先看 `node_modules/next/dist/docs/` |
| React      | `19.2.4` | Server Components + Client Components 混用                   |
| TypeScript | `^5`     | `strict: true`，`@/* → src/*` 路径别名                          |
| Node       | `20+`    | 没有 `engines` 字段，但 Next 16 要求 ≥ 20                          |

### 4.2 数据层

- **Prisma `7.x`** + **`@libsql/client`** + **`@prisma/adapter-libsql`** —— 客户端生成到 `src/generated/prisma`（gitignored）
- 默认 **SQLite**（`file:./dev.db`，gitignored），schema 用的是泛型类型，迁移到 PostgreSQL/MySQL 只需改 `provider` + `DATABASE_URL`

### 4.3 实时与音频

- 客户端：**原生 `WebSocket`**（`/messages` 弹幕 + `/audio` 音频流）
- 服务端：**`ws@8.21.0`**（独立 Node 进程）+ `http` 内置模块
- 音频管线：**Web Audio API**（`AudioContext` → `decodeAudioData` → `AnalyserNode` + `requestAnimationFrame` 可视化）
- 锁屏 / 熄屏：MediaSession 元数据 + `navigator.wakeLock` + PWA Manifest（iOS 需"添加到主屏幕"）

### 4.4 样式与前端

- **零** UI 库、**零** CSS-in-JS、**零** 状态库
- **原生 CSS** + CSS 自定义属性（design token 在 `src/styles/globals.css:3-52`）
- 字体走 Google Fonts `<link>`（**不用** `next/font`，因为大陆网络下构建时下载会失败）
- 图标全内联 `<svg>`，无图标库
- 状态管理：`useState` / `useRef` / `useReducer`，无 Redux/Zustand/Jotai
- 数据获取：原生 `fetch`，无 SWR / TanStack Query / axios
- 表单：受控输入，无 react-hook-form
- 校验：无 zod / yup；运行时由 LLM 做语义审核

### 4.5 安全

- **CSP**（`next.config.ts`）：`default-src 'self'`，显式白名单 Cloudflare Web Analytics、Google Fonts、`ws:/wss:`；dev 模式额外放开 `'unsafe-eval'`
- **安全响应头**：`X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy: camera/microphone/geolocation/interest-cohort=()`
- **路径遍历防护**：`src/lib/upload-path.ts` 的 `resolveUnderPublic()` 严格校验 `public/` 路径前缀
- **上传大小限制**：`ws-server` 16 MB 上限 + 4 MB 单帧上限
- **时序安全字符串比较**：`ws-server` 校验 `WS_BROADCAST_TOKEN` 用异或累加

### 4.6 完整依赖

**`dependencies`（11 项）**
`@libsql/client` · `@prisma/adapter-libsql` · `@prisma/client` · `dotenv` · `fast-xml-parser` · `next` · `p-limit` · `react` · `react-dom` · `rss-parser` · `turndown` · `ws`

**`devDependencies`（16 项）**
`@jest/globals` · `@types/jest` · `@types/node` · `@types/react` · `@types/react-dom` · `@types/turndown` · `@types/ws` · `eslint` · `eslint-config-next` · `jest` · `prisma` · `ts-jest` · `ts-node` · `tsx` · `typescript` · `vitest`

> Jest + Vitest **双测试框架并存**（历史遗留）。12 个 `.test.ts` 全在 `src/__tests__/`，**全是后端 / 集成测试**，无 React 组件测试。

---

## 五、环境要求

| 项        | 要求                         | 备注                                                             |
| -------- | -------------------------- | -------------------------------------------------------------- |
| Node.js  | `≥ 20`                     | Next 16 强制要求                                                   |
| npm      | `≥ 10`                     | 项目默认包管理器                                                       |
| ComfyUI  | 自托管实例                      | 必须装 **OmniVoice TTS 节点**（`workflows/` 下两个 JSON 是导出的 API 格式工作流） |
| LLM      | OpenAI 兼容 API              | 任意支持 `/v1/chat/completions` 的服务（含本地 Ollama、vLLM、LM Studio）     |
| 反向代理（生产） | Caddy / nginx / Cloudflare | 用于 HTTPS + WSS 终结                                              |
| 进程守护（生产） | systemd / PM2 / Docker     | 双进程都要托管                                                        |

---

## 六、本地开发

### 6.1 克隆与安装

```bash
git clone <repo-url> radioai
cd radioai
npm install                    # 同时会触发 prisma generate (postinstall)
cp .env.example .env           # 然后按需填写（见 §7）
```

### 6.2 初始化数据库

```bash
npx prisma migrate deploy      # 把 0_init 应用到 dev.db
# 或者开发时：
npx prisma migrate dev         # 生成新迁移
```

### 6.3 启动双进程

**终端 A —— Next.js**

```bash
npm run dev
# → http://localhost:3000
```

**终端 B —— WebSocket 扇出服务器**

```bash
npm run ws-server
# → ws://localhost:8080  (听众)
# → http://127.0.0.1:8081 (Next 内部 HTTP 广播 API，仅本机)
```

打开 <http://localhost:3000> 听广播，<http://localhost:3000/admin> 进管理端（默认密码为 `.env` 里的 `ADMIN_PASSWORD`）。

### 6.4 第一次使用流程

1. 进入 `/admin` → 修改默认密码
2. **LLM 配置**：填 API URL、Key、模型名
3. **ComfyUI 配置**：填服务端 URL、Token、Webhook URL
4. **人物**：创建至少一个 Persona
5. **工作流**：上传 ComfyUI 导出的 API 格式 JSON（仓库已带 `workflows/my_omnivoice-tts_api.json` 和 `_clone_api.json` 两个示例）
6. **主题**：把 Persona + Workflow 绑成一个 Theme，激活它
7. **新闻**（可选）：加 RSS 源、配 Tavily Key
8. **音频缓冲**：调 `prebufferSentences` / `prebufferSeconds`，改完立即生效

---

## 七、环境变量

> 详细注释见 `.env.example`。**只有 5 个变量必须存在于环境**（含 `COMFYUI_WEBHOOK_SECRET`），其余配置全部走数据库 + admin 控制台。

| 变量                       | 必填    | 默认              | 说明                                                                                  |
| ------------------------ | ----- | --------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`           | 否     | `file:./dev.db` | Prisma + libsql；**必须从项目根目录启动**才会解析到 `dev.db`                                        |
| `ADMIN_PASSWORD`         | **是** | 无               | `/admin/login` 的密码，**签发 cookie 前就要读到**，所以不能存 DB；≥ 8 字符                              |
| `WS_BROADCAST_TOKEN`     | **是** | 无               | Next 进程 ↔ ws-server 的共享秘钥；未设置时 ws-server 拒绝启动 HTTP 广播 API                           |
| `WS_PORT`                | 否     | `8080`          | ws-server 浏览器 WS 监听端口                                                               |
| `WS_HTTP_PORT`           | 否     | `8081`          | ws-server 内部 HTTP 广播 API 端口，**只绑 127.0.0.1**                                        |
| `WS_BROADCAST_BASE_URL`  | 否     | 派生              | Next → ws-server HTTP 客户端的目标 URL；多机部署时设                                             |
| `NEXT_PUBLIC_WS_URL`     | 否     | 派生              | **浏览器** → ws-server 的 WS base URL；`NEXT_PUBLIC_` 前缀表示**构建时注入**，改完必须 `npm run build` |
| `COMFYUI_WEBHOOK_SECRET` | 生产推荐  | 无               | ComfyUI **回调**给我们时用的 HMAC 验签秘钥（与发给 ComfyUI 的 token 是**反方向**，两个不同的秘钥）                |

### 优先级速查

| 场景                              | 怎么设                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| 本地开发单台机器                        | `WS_PORT=8080` + `WS_HTTP_PORT=8081`（默认值）                                                |
| 生产 HTTPS 前置反代                   | `NEXT_PUBLIC_WS_URL=wss://your.domain`（不要带端口；如非默认请带 `:端口`）                               |
| Next 和 ws-server 拆机器            | `WS_BROADCAST_BASE_URL=http://10.0.0.5:8081` + `NEXT_PUBLIC_WS_URL=wss://ws.your.domain` |
| Cloudflare Tunnel / Origin Rule | `NEXT_PUBLIC_WS_URL=wss://hualao.830038.xyz`（无端口，走 443）                                  |

---

## 八、生产部署

### 8.1 构建

```bash
npm ci                          # 干净安装
npx prisma migrate deploy       # 跑迁移
npm run build                   # 生成 .next/（会自动 prisma generate）
```

`npm start` 会先跑 `prisma migrate deploy` 再起 Next.js。

### 8.2 进程守护（systemd 示例）

`/etc/systemd/system/radioai-next.service`

```ini
[Unit]
Description=RadioAI Next.js
After=network.target

[Service]
WorkingDirectory=/opt/radioai
EnvironmentFile=/opt/radioai/.env
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -p 3000
Restart=always
User=radioai

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/radioai-ws.service`

```ini
[Unit]
Description=RadioAI WebSocket fan-out
After=network.target

[Service]
WorkingDirectory=/opt/radioai
EnvironmentFile=/opt/radioai/.env
ExecStart=/usr/bin/npx tsx ws-server/index.ts
Restart=always
User=radioai

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now radioai-next radioai-ws
```

### 8.3 反向代理（Caddy 示例）

> Caddyfile 放在 `/etc/caddy/Caddyfile` 或独立子域目录。**两个上游都要反代**：`3000`（HTTP/HTTPS）和 `8080`（WSS）。

```caddyfile
# 主站 + WSS 同源终结
your.domain, ws.your.domain {
    encode zstd gzip

    @notws {
        not path /messages /audio
    }
    handle @notws {
        reverse_proxy 127.0.0.1:3000 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto https
        }
    }

    # 浏览器 → /messages 和 /audio 走 wss
    handle /messages* /audio* {
        reverse_proxy 127.0.0.1:8080
    }

    # /uploads/* 直接交给 Next（运行时写入，必须走 App Router 路由，
    # 不能让 public/ 静态服务，因为它在构建时被快照，不感知运行时新增）
    handle /uploads/* {
        reverse_proxy 127.0.0.1:3000
    }

    header {
        # 关键：透传客户端真实协议，CSP 仍由 Next 自己出
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}

# 邮件发送 / 其他
```

**关键点**：

1. **`/messages` 和 `/audio` 单独 handle**，直转 `127.0.0.1:8080`，**不要**让 Next.js 升级 HTTP 请求到 WS（Next 自带 WS 会被代理劫持）
2. **`/uploads/*` 必须经 Next.js**：Next 构建时把 `public/` 快照成静态资产，运行时上传的文件（参考音频等）需要走 `src/app/uploads/[[...path]]/route.ts`
3. **不要让 8081 暴露在反代后**——它是 loopback-only 的内部 HTTP API
4. 如果浏览器在 HTTPS 下，WebSocket 会自动升级到 `wss://`，浏览器端不需要改代码（`ws-url.ts` 会按 `window.location.protocol` 自动选 scheme）

### 8.4 Nginx 反代片段（备选）

```nginx
# /etc/nginx/conf.d/radioai.conf
server {
    listen 443 ssl http2;
    server_name your.domain ws.your.domain;
    # ... ssl_certificate 等

    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /messages {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;       # WS 长连接
    }

    location /audio {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

### 8.5 Cloudflare 接入（可选）

- DNS 用 Cloudflare 代理（橙色云）→ WSS 由 Cloudflare 终结，`NEXT_PUBLIC_WS_URL` 设为 `wss://your.domain` 即可
- 免费版对 WS 连接数和消息频率有限制，**生产建议开 Cloudflare Spectrum**（TCP/UDP 透传，无此限制）
- Web Analytics beacon 已写入 CSP 白名单（`static.cloudflareinsights.com`）

### 8.6 数据库迁移到生产

`dev.db` 是开发库，**生产请换 PostgreSQL 或 MySQL**：

1. 改 `prisma/schema.prisma` 的 `datasource db { provider = "postgresql" }`
2. `DATABASE_URL` 换成新库连接串
3. 删 `prisma/migrations/`，跑 `npx prisma migrate dev --name init` 重新生成（schema 字段类型都是泛型，迁移无损）

### 8.7 部署后验收清单

- [ ] `https://your.domain/` 能加载入口动画
- [ ] 点进入后能看到波形 / 听到测试音频
- [ ] 浏览器 console 没有 `WebSocket` / `CSP` 报错
- [ ] `/admin/login` 能用 `ADMIN_PASSWORD` 登录
- [ ] 上传一首参考音频后，`/uploads/...` 路径能直接播放（不走 Next 静态资源）
- [ ] 锁屏后音频继续（iOS 需先"添加到主屏幕"成为 PWA）
- [ ] 长时间播放屏幕不熄（Wake Lock 生效）

---

## 九、管理员控制台 `/admin`

| 板块                  | 功能                                                  |
| ------------------- | --------------------------------------------------- |
| **主题 (Themes)**     | 配 Persona × Workflow，激活/停用，**全局唯一激活**               |
| **人物 (Personas)**   | 主播人设：名字 + 系统提示词                                     |
| **工作流 (Workflows)** | ComfyUI TTS 工作流 JSON + 参考音频 + 参考文本（声音克隆）            |
| **新闻 (News)**       | RSS 源管理、自动抓取计划、Tavily 实时联网                          |
| **留言管理 (Messages)** | 听众留言 AI 审核（pending/approved/rejected）、人工通过/拒绝/隐藏/删除 |
| **音频缓冲 (Buffer)**   | 调预缓冲句数 / 秒数 / 模式 / 分组大小                             |
| **LLM 配置**          | API URL、Key、模型名（持久化到 DB）                            |
| **ComfyUI 配置**      | 服务端 URL、Token、Webhook URL、超时                        |

> 所有运行时配置**热生效**，不需要重启进程。

## 十、听众端 `/`

| 模块        | 说明                                                      |
| --------- | ------------------------------------------------------- |
| 入口动画      | 赛博朋克式 "PRESS START" 浮层，点击触发用户手势后才能播放音频（浏览器 autoplay 策略） |
| 实时播放器     | 流式 WAV 播放，频谱可视化、播放/暂停、静音                                |
| 留言墙       | 自动滚动展示已审核留言；可配最大条数 / 滚动速度 / 总开关                         |
| 留言抽屉      | 底部抽屉提交留言（callsign + 内容），过 AI 审核后上墙                      |
| 锁屏后台      | iOS 安装为 PWA 后可用；Android 原生支持                            |
| Wake Lock | 播放中 / 缓冲中 / 重连中都保持屏幕常亮（浏览器 API 失败时静默降级）                 |
| iOS 安装提示  | iOS 非 standalone 模式下、播放时一次性提示"添加到主屏幕"（localStorage 记一次） |
| 自适应       | 桌面 / 移动 / iPad 横屏 / ≤380px 小屏均独立布局                      |

---

## 十一、项目结构

```
radioai/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # 听众首页
│   │   ├── layout.tsx          # 根布局（fonts、meta、manifest 引用）
│   │   ├── page.module.css     # 首页 CSS Module
│   │   ├── globals.css         # ⚠️ 旧脚手架残留，未被引用
│   │   ├── admin/              # 管理端页面
│   │   ├── api/                # API 路由
│   │   │   ├── admin/          # 管理端鉴权 + CRUD
│   │   │   ├── audio/          # 备用 REST 音频流
│   │   │   ├── audio-buffer/   # 缓冲配置
│   │   │   ├── comfyui/        # ComfyUI 提交 + webhook
│   │   │   ├── config/         # LLM / ComfyUI / 新闻 / 留言 / 审核配置
│   │   │   ├── live/           # 直播引擎控制
│   │   │   ├── messages/       # 听众留言提交
│   │   │   ├── tts/            # TTS 触发
│   │   │   └── health/         # 健康检查
│   │   ├── uploads/[[...path]]/route.ts   # 运行时上传文件的 HTTP 路由（关键！）
│   │   └── listen/             # 备用入口
│   ├── components/             # 7 个手写组件
│   │   ├── AudioVisualizer.tsx
│   │   ├── EnterOverlay.tsx
│   │   ├── IosInstallHint.tsx
│   │   ├── MessageInputDrawer.tsx
│   │   ├── MessageWall.tsx
│   │   ├── MessageWallPanel.tsx
│   │   └── RadioPlayer.tsx
│   ├── config/                 # 单行 DB 配置读取器
│   ├── generated/              # Prisma 客户端输出（gitignored）
│   ├── lib/
│   │   ├── admin-auth.ts       # 服务端鉴权
│   │   ├── admin-cookie.ts     # HMAC 签名 / 验签
│   │   ├── comfyui/            # ComfyUI 工作流提交 + 轮询
│   │   ├── live-engine/        # LLM → TTS → 广播的编排器
│   │   ├── llm/                # OpenAI 兼容 chat 客户端
│   │   ├── moderation/         # LLM 留言审核
│   │   ├── news/               # RSS + Tavily
│   │   ├── prisma/             # Prisma client 实例
│   │   ├── rate-limit.ts       # 简单限流
│   │   ├── upload-path.ts      # 上传路径安全校验
│   │   ├── wake-lock.ts        # Wake Lock 钩子
│   │   ├── ws-server.ts        # Next → ws-server HTTP 客户端
│   │   └── ws-url.ts           # 浏览器 → ws-server URL 解析
│   ├── styles/
│   │   └── globals.css         # 在用的全局 CSS（design token + reset）
│   ├── __tests__/              # 12 个 .test.ts（后端/集成测试）
│   └── proxy.ts                # Next 16 中间件
├── public/
│   ├── manifest.webmanifest    # PWA 清单
│   ├── icons/                  # apple-touch / 192 / 512
│   ├── uploads/                # 运行时上传目录
│   └── *.svg                   # 默认 favicon 类
├── ws-server/
│   └── index.ts                # 独立 WebSocket 扇出进程
├── prisma/
│   ├── schema.prisma           # 12 个 model
│   └── migrations/0_init/
├── workflows/                  # ComfyUI 导出的 API 格式工作流
│   ├── my_omnivoice-tts_api.json
│   └── my_omnivoice-tts_clone_api.json
├── scripts/
│   └── check-workflow-db.mjs
├── .env.example                # 必读：环境变量模板
├── .env                        # 本机配置（gitignored）
├── next.config.ts              # CSP、安全头、allowedDevOrigins
├── prisma.config.ts            # DATABASE_URL 默认值兜底
├── tsconfig.json               # strict、@ 别名
├── eslint.config.mjs           # flat config，next preset
├── jest.config.ts              # next/jest preset
├── vitest.config.ts            # node env，60s 超时
├── package.json                # dev/build/start/lint/ws-server 脚本
└── CLAUDE.md / AGENTS.md       # 协作约定
```

---

## 十二、常见问题

<details>
<summary><b>Q：浏览器一直报 <code>WebSocket connection to wss://...:8080/messages failed</code></b></summary>

- 生产必须**用反代终结 WSS**（Caddy/Nginx/Cloudflare），不能直接浏览器连裸 `ws-server:8080`
- 设置 `NEXT_PUBLIC_WS_URL=wss://your.domain`（**无端口**走 443，**带端口**用 `:8443` 之类）
- 改完 **必须** `npm run build`，因为 `NEXT_PUBLIC_` 是构建时注入的
- 确认防火墙放行；`ws-server` 进程要先于 Next 启动
  
  </details>

<details>
<summary><b>Q：上传了参考音频但 <code>GET /uploads/.../xxx.flac 404</code></b></summary>

这是 Next.js 把 `public/` 在**构建时**快照成静态资产导致的——运行时上传的文件不会被静态服务捕获。

解决：本项目已经在 `src/app/uploads/[[...path]]/route.ts` 加了 App Router 路由兜底。**确认反代把 `/uploads/*` 转给 Next.js**（不能直接走静态服务），参考 §8.3 的 Caddy 片段。

</details>

<details>
<summary><b>Q：admin 登录页 503 "admin password not configured"</b></summary>

`.env` 里的 `ADMIN_PASSWORD` 缺失或 < 8 字符。修完**重启 Next.js**（不是热重载——env 在进程启动时读）。

</details>

<details>
<summary><b>Q：<code>ECONNREFUSED 127.0.0.1:8081</code></b></summary>

`ws-server` 进程没起。**两个进程都要起**。检查 `npm run ws-server` 终端是否还在，以及 `WS_BROADCAST_TOKEN` 是否设置（未设置时 ws-server 会拒绝启动 HTTP 广播 API）。

</details>

<details>
<summary><b>Q：iOS 锁屏后音频停了</b></summary>

1. 必须先 **Safari → 分享 → 添加到主屏幕**，作为 PWA 启动（不是从书签进）
2. PWA 启动后锁屏应能看到控制中心媒体卡片
3. iOS < 16.4 设备无法真正后台播放，会被强制暂停
   
   </details>

<details>
<summary><b>Q：Android 熄屏后音频停了</b></summary>

- Android Chrome 自带后台播放策略，锁屏一般不会停
- 如果停了，检查 `chrome://flags` 的"媒体会话"和"后台限制"
- Wake Lock 在锁屏后无法阻止熄屏——需要常亮屏幕的话同时打开系统的"保持唤醒"开发者选项
  
  </details>

<details>
<summary><b>Q：<code>npm run build</code> 卡在字体下载</b></summary>

默认走 Google Fonts CDN（`<link>` 加载，构建不下载）。如果看到 `next/font` 报错，那是误装，**项目刻意不用 `next/font`**，原因见 `src/app/layout.tsx:26-32` 的注释。

</details>

<details>
<summary><b>Q：跑测试？</b></summary>

```bash
npx jest      # 12 个 .test.ts
npx vitest    # 另一套配置（按文件名匹配）
```

`package.json` 里**没有** `test` script——历史遗留。

</details>

---

## 十三、安全须知

> 部署前请完整过一遍。

1. **`ADMIN_PASSWORD`** 必须 ≥ 8 字符；定期更换。
2. **`WS_BROADCAST_TOKEN`** 用密码学随机生成（如 `openssl rand -hex 32`），**绝对不要**用短口令。
3. **`COMFYUI_WEBHOOK_SECRET`** 同上。如果不用 webhook 回调，可以留空——但 ComfyUI 端要配齐（同一秘钥）。
4. **反代必须强制 HTTPS**——明文 WS 在公网等于裸奔，token 可被嗅探。
5. **生产不开 Next.js dev 模式**（`next dev`）——它会带 `'unsafe-eval'` CSP 豁免。
6. **数据库备份**：`dev.db` 是个普通文件，cron `cp dev.db backup/dev-$(date +%F).db` 即可。
7. **`/uploads/` 权限**：不要把敏感文件放进去；当前实现按扩展名设 MIME，但没有执行权限（只是静态读取）。
8. **CSP 报告**：`script-src` 含 `'unsafe-inline'` 是已知技术债（`next.config.ts` 注释 M4），待 Next.js nonce API 稳定后改。

---

## 十四、贡献与开发约定

- 
- **不引入**新依赖请先讨论——整套栈刻意保持极简
- **PR 前跑** `npm run lint`（项目没用 Prettier，依赖 ESLint `--fix`）
- **数据库 schema 改动**必须配套生成 migration：`npx prisma migrate dev --name <name>`
- **不要在 PR 里改** `src/app/globals.css`（脚手架残留文件，未来要删）

## 十五、License

MIT
