# 排课管理系统 — 技术文档

> **面向读者**：刚接触本项目的开发者（包括前端、后端、运维方向）。读完本文，你将从"完全不了解"到"能独立开发新功能、定位线上问题、完成部署运维"。
>
> **文档结构**：先建立全局认知（项目是什么、技术栈、目录结构），再逐层深入（数据模型 → API → 前端 → 鉴权 → 部署 → 开发指南），最后附完整 API 速查表与 FAQ。

---

## 目录

1. [项目总览](#1-项目总览)
2. [技术栈与架构](#2-技术栈与架构)
3. [目录结构详解](#3-目录结构详解)
4. [数据库设计（数据模型）](#4-数据库设计数据模型)
5. [后端 API 完全指南](#5-后端-api-完全指南)
6. [鉴权与权限系统](#6-鉴权与权限系统)
7. [前端架构与组件](#7-前端架构与组件)
8. [核心业务流程](#8-核心业务流程)
9. [部署与运维](#9-部署与运维)
10. [开发指南](#10-开发指南)
11. [API 速查表](#11-api-速查表)
12. [FAQ 与常见问题](#12-faq-与常见问题)

---

## 1. 项目总览

### 1.1 这是什么

一套面向教育培训机构（琴行、画室、辅导班、体育培训等）的**排课与教务管理系统**。核心能力：

- **教务核心**：学员档案、课程管理、排课、点名、课时计费、结转
- **运营增长**：优惠券、会员卡、CRM 线索跟进、转化分析
- **数据洞察**：数据看板（营收/课时/转化）、多维报表、审计日志
- **多方协作**：管理员后台（细粒度权限）、教师端（课后反馈/绩效）、家长端 H5（专属链接查看孩子课表与余额）

### 1.2 设计理念

| 理念 | 说明 |
|------|------|
| **单文件部署** | 整个后端就是一个 `node server.js`，数据库是单个 SQLite 文件，无需额外中间件 |
| **按文件名路由** | `node-functions/api/students.js` 自动映射为 `/api/students`，新增 API 只需加文件 |
| **Edge Functions 风格** | 每个处理函数接收 `{ request, env }` 上下文，返回 Web Response，与 Cloudflare Workers 兼容 |
| **前后端同源** | 后端同时托管 `dist/` 静态资源和 API，无跨域问题 |
| **数据安全** | 所有写操作审计留痕，RBAC 细粒度权限，家长端双层鉴权 |

### 1.3 三种用户角色与入口

| 角色 | 入口 | 能力 |
|------|------|------|
| **管理员** | 首页登录 → 后台 `#admin` | 按分配的权限操作对应模块 |
| **教师** | 同管理员入口 | 查看排课/点名/学员/课程/报表，提交课后反馈 |
| **家长** | 专属链接 `?s=学员ID&t=token` | 仅查看自己孩子的排课、课时余额、教师反馈 |

---

## 2. 技术栈与架构

### 2.1 技术栈

**前端**：
- React 18 + TypeScript 5 + Vite 5
- Tailwind CSS 3（原子化样式）
- i18next + react-i18next（中英双语）
- react-markdown + remark-gfm（公告 Markdown 渲染）
- date-fns（日期处理）

**后端**：
- Node.js 20（原生 HTTP Server，无 Express/Koa）
- better-sqlite3 11（同步 SQLite 驱动，WAL 模式）
- Web Crypto API（HMAC-SHA256 签名、PBKDF2 密码哈希）

**部署**：
- Docker + Docker Compose
- GitHub Actions 自动构建镜像推送到 GHCR
- 多阶段构建，最终镜像仅含运行必需文件

> **为什么选 SQLite 而不是 MySQL/PostgreSQL？**
> 教培机构数据量通常在万级以下，SQLite 的单文件部署、零运维、WAL 并发模式完全够用。`better-sqlite3` 的同步 API 也避免了 async/await 的回调地狱，代码更简洁。如果未来需要横向扩展，store.js 的数据访问层抽象可平滑迁移到其他数据库。

### 2.2 架构图

```
┌──────────────────────────────────────────────┐
│                   浏览器                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  首页   │  │ 家长端H5 │  │  管理后台   │ │
│  │(登录页) │  │(专属链接)│  │  (RBAC)    │ │
│  └────┬────┘  └─────┬────┘  └──────┬──────┘ │
└───────┼─────────────┼──────────────┼────────┘
        │             │              │
        └─────────────┴──────────────┘
                      │ HTTP (同源)
                      ▼
┌──────────────────────────────────────────────┐
│            Node HTTP Server (server.js)       │
│                                               │
│  ┌─────────────────┐  ┌───────────────────┐ │
│  │  静态资源托管   │  │  API 路由分发      │ │
│  │  (dist/ → SPA)  │  │  (/api/* → 处理器) │ │
│  └─────────────────┘  └────────┬──────────┘ │
│                                │             │
│                ┌───────────────┼──────────┐ │
│                ▼               ▼          ▼ │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ auth.js  │ │ store.js │ │ audit.js   │ │
│  │ (鉴权)   │ │ (数据层) │ │ (审计)     │ │
│  └──────────┘ └────┬─────┘ └────────────┘ │
│                      │                      │
│                      ▼                      │
│              ┌──────────────┐               │
│              │  SQLite      │               │
│              │  (pai.db)    │               │
│              └──────────────┘               │
└──────────────────────────────────────────────┘
```

### 2.3 请求生命周期（一个 API 请求经历了什么）

以 `POST /api/student-add` 为例：

```
1. 浏览器 fetch('/api/student-add', { method:'POST', body:..., headers:{Authorization:'Bearer xxx'} })
   ↓
2. server.js 收到请求，pathname='/api/student-add'
   ↓
3. matchApiRoute() 按文件名匹配到 node-functions/api/student-add.js
   ↓
4. toWebRequest() 把 Node 的 IncomingMessage 转成 Web Request 对象
   ↓
5. 调用 mod.default(context) 或 mod.onRequestPost(context)
   ↓
6. student-add.js 内部：
   a. requirePermission(context, 'students:create')
      → auth.js 校验 token 签名 → 查库取最新权限与状态 → 判断是否拥有 students:create
   b. 读取 request.json() 获取 body
   c. 调用 store.js 的 addStudent() 写入 SQLite
   d. 调用 audit.js 的 writeAudit() 记录审计日志
   e. 返回 json({ code:0, message:'学员已新增', data:{ student } })
   ↓
7. server.js 把 Web Response 写回 Node ServerResponse
   ↓
8. 浏览器收到 JSON 响应
```

---

## 3. 目录结构详解

```
/workspace
├── server.js                    # Node HTTP 服务器入口（路由分发 + 静态资源托管）
├── package.json                 # 依赖与脚本
├── Dockerfile                   # 多阶段构建定义
├── docker-compose.yml           # Docker Compose 部署配置
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 构建配置
├── tailwind.config.js           # Tailwind CSS 配置
│
├── node-functions/              # ===== 后端代码 =====
│   ├── _lib/                    # 后端核心库
│   │   ├── store.js             # 数据访问层（SQLite 操作、所有表的 CRUD）
│   │   ├── auth.js              # 鉴权（token 签发/校验、RBAC 权限模型、密码哈希）
│   │   ├── audit.js             # 审计日志写入助手
│   │   ├── config-file.js       # 系统配置读写（config.json）
│   │   └── id.js                # ID 生成器（前缀+时间戳+计数器+随机）
│   │
│   └── api/                     # API 处理器（按文件名自动映射路由）
│       ├── auth.js              # /api/auth — 登录/校验/引导
│       ├── students.js          # /api/students — 学员查询
│       ├── student-add.js       # /api/student-add — 新增学员
│       ├── ...                  # （每个文件一个 API，详见第 5 节）
│       └── parent-access.js     # /api/parent-access — 家长端访问
│
├── src/                         # ===== 前端代码 =====
│   ├── main.tsx                 # 应用入口
│   ├── App.tsx                  # 根组件（页面模式路由：home/parent/admin）
│   ├── api/                     # 前端 API 调用层
│   │   ├── index.ts             # 公共 API（学员搜索、排课查询、配置、家长端）
│   │   └── admin.ts             # 管理后台 API（带鉴权 token 的统一封装）
│   ├── types/
│   │   └── index.ts             # TypeScript 类型定义（所有业务实体）
│   ├── i18n/                    # 国际化
│   │   ├── index.ts             # i18next 配置
│   │   ├── zh.ts                # 中文（源 Schema）
│   │   └── en.ts                # 英文（类型约束必须与 zh 一致）
│   ├── utils/
│   │   ├── cn.ts                # className 合并工具
│   │   └── permission.ts        # 前端权限判断工具（canSeeModule 等）
│   └── components/
│       ├── Admin/               # 后台管理组件（22 个子页面）
│       ├── Calendar/            # 日历视图组件
│       ├── Home/                # 首页组件
│       ├── Parent/              # 家长端 H5 组件
│       ├── ui/                  # 基础 UI 组件库
│       ├── SearchBar.tsx        # 学员搜索栏
│       ├── ScheduleCard.tsx     # 排课卡片
│       └── ScheduleDetail.tsx   # 排课详情
│
├── dist/                        # 前端构建产物（gitignore，build 时生成）
├── data/                        # 数据目录（gitignore，运行时创建）
│   ├── pai.db                   # SQLite 数据库文件
│   ├── pai.db-wal               # WAL 日志
│   ├── pai.db-shm               # 共享内存
│   ├── config.json              # 系统配置（appName 等）
│   └── backups/                 # 数据库备份文件
│
├── .github/workflows/
│   └── docker-publish.yml       # GitHub Actions：自动构建 Docker 镜像
│
└── TECHNICAL_GUIDE.md           # 本文档
```

### 3.1 关键设计约定

**后端路由映射规则**（`server.js` 第 79-91 行）：

```
/api/students              → node-functions/api/students.js
/api/auth/bootstrap        → node-functions/api/auth.js（子路由后缀匹配）
/api/backups/restore       → node-functions/api/backups.js（子路由后缀匹配）
```

匹配策略：先精确匹配 `apiModules[pathname]`，匹配不到则从右向左逐段去掉路径段尝试父路由。

**处理器导出形式**（两种均可）：

```javascript
// 形式1：default 函数，内部自行判断 method
export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'GET') return handleGet(context)
  if (request.method === 'POST') return handlePost(context)
  // ...
}

// 形式2：按方法分别导出
export async function onRequestGet(context) { /* ... */ }
export async function onRequestPost(context) { /* ... */ }
```

---

## 4. 数据库设计（数据模型）

数据库文件：`data/pai.db`（SQLite），使用 WAL 模式（读不阻塞写）。

### 4.1 表清单总览

| 表名 | 用途 | ID 前缀 | 主要关联 |
|------|------|---------|----------|
| `students` | 学员档案 | `stu_` | — |
| `courses` | 课程定义 | `crs_` | — |
| `schedules` | 排课记录 | `sch_` | student_id, course_id |
| `enrollments` | 报名记录（计费核心） | `enr_` | student_id, course_id |
| `transfers` | 结转流水 | `trf_` | from_enrollment_id, to_enrollment_id |
| `admins` | 管理员账号 | `adm_` | — |
| `audit_logs` | 审计日志 | `aud_` | actor_id |
| `announcement` | 公告（单行） | — | — |
| `feedback` | 课后反馈 | `fdb_` | schedule_id, teacher_id, student_id, course_id |
| `coupons` | 优惠券定义 | `cup_` | — |
| `coupon_redemptions` | 优惠券核销记录 | — | coupon_id, enrollment_id, student_id |
| `memberships` | 会员卡类型 | `mem_` | — |
| `student_memberships` | 学员办卡记录 | `smm_` | student_id, membership_id |
| `leads` | CRM 线索 | `led_` | student_id（转化后） |
| `lead_followups` | 线索跟进记录 | `fol_` | lead_id |

### 4.2 各表字段详解

#### students — 学员档案

```sql
CREATE TABLE students (
  id           TEXT PRIMARY KEY,        -- stu_ 开头
  name         TEXT NOT NULL,           -- 姓名
  grade        TEXT DEFAULT '',         -- 年级
  phone        TEXT DEFAULT '',         -- 家长手机号（家长端鉴权用）
  parent_name  TEXT DEFAULT '',         -- 家长姓名
  gender       TEXT DEFAULT '',         -- 性别
  birthday     TEXT DEFAULT '',         -- 生日
  status       TEXT DEFAULT 'active',   -- active/inactive
  tags         TEXT DEFAULT '',         -- 标签（逗号分隔）
  remark       TEXT DEFAULT '',         -- 备注
  source       TEXT DEFAULT '',         -- 来源
  created_at   TEXT DEFAULT (datetime('now'))
);
```

**索引**：无显式索引（按 id 主键查询为主）

#### courses — 课程定义

```sql
CREATE TABLE courses (
  id                 TEXT PRIMARY KEY,     -- crs_ 开头
  name               TEXT NOT NULL,        -- 课程名
  teacher            TEXT DEFAULT '',      -- 教师姓名
  location           TEXT DEFAULT '',      -- 教室/地点
  color              TEXT DEFAULT '',      -- 日历显示颜色
  default_start_time TEXT DEFAULT '',      -- 默认开始时间 HH:mm
  default_end_time   TEXT DEFAULT '',      -- 默认结束时间 HH:mm
  unit_price         REAL DEFAULT 0,       -- 单价（元/课时）
  billing_type       TEXT DEFAULT 'per_lesson',  -- 计费方式：per_lesson/per_month/per_term
  capacity           INTEGER DEFAULT 0,    -- 容量（0=不限）
  term               TEXT DEFAULT '',      -- 学期
  status             TEXT DEFAULT 'active',
  category           TEXT DEFAULT '',      -- 分类
  description        TEXT DEFAULT '',      -- 描述
  created_at         TEXT DEFAULT (datetime('now'))
);
```

#### schedules — 排课记录

```sql
CREATE TABLE schedules (
  id           TEXT PRIMARY KEY,        -- sch_ 开头
  student_id   TEXT NOT NULL,           -- 学员ID
  student_name TEXT NOT NULL,           -- 学员姓名（冗余，避免连表查询）
  course_id    TEXT DEFAULT '',         -- 课程ID
  course_name  TEXT NOT NULL,           -- 课程名（冗余）
  teacher      TEXT DEFAULT '',         -- 教师
  location     TEXT DEFAULT '',         -- 教室
  date         TEXT NOT NULL,           -- 上课日期 yyyy-MM-dd
  start_time   TEXT DEFAULT '',         -- 开始时间 HH:mm
  end_time     TEXT DEFAULT '',         -- 结束时间 HH:mm
  note         TEXT DEFAULT '',         -- 备注
  color        TEXT DEFAULT '',         -- 颜色
  attended     INTEGER,                 -- 点名状态：1=到课 0=缺勤 NULL=未点名
  status       TEXT DEFAULT 'scheduled', -- scheduled/completed/cancelled
  room         TEXT DEFAULT '',         -- 教室（预留）
  makeup_for   TEXT DEFAULT '',         -- 补课关联的原排课ID
  created_at   TEXT DEFAULT (datetime('now'))
);
-- 索引
CREATE INDEX idx_schedules_student_date ON schedules(student_id, date);
CREATE INDEX idx_schedules_date ON schedules(date);
CREATE INDEX idx_schedules_student ON schedules(student_id);
CREATE INDEX idx_schedules_course ON schedules(course_id);
```

> **为什么 student_name / course_name 要冗余存储？**
> 排课是最高频的查询（日历、点名、报表都依赖），每次连表查 students + courses 会很慢。冗余字段让单表查询即可拿到展示所需的所有信息。代价是学员改名时需要级联更新排课中的 student_name（`student-update.js` 已处理）。

#### enrollments — 报名记录（计费核心）

```sql
CREATE TABLE enrollments (
  id                    TEXT PRIMARY KEY,     -- enr_ 开头
  student_id            TEXT NOT NULL,
  course_id             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active', -- active/settled/finished/expired
  purchased_hours       INTEGER NOT NULL DEFAULT 0,  -- 购买课时数
  gift_hours            INTEGER NOT NULL DEFAULT 0,  -- 赠送课时数
  remaining_paid_hours  INTEGER NOT NULL DEFAULT 0,  -- 剩余付费课时
  remaining_gift_hours  INTEGER NOT NULL DEFAULT 0,  -- 剩余赠课课时
  unit_price            REAL NOT NULL DEFAULT 0,     -- 单价
  total_amount          REAL NOT NULL DEFAULT 0,     -- 总金额
  paid_amount           REAL NOT NULL DEFAULT 0,     -- 已付金额
  discount_amount       REAL NOT NULL DEFAULT 0,     -- 折扣金额
  channel               TEXT DEFAULT '',     -- 渠道
  sales_id              TEXT DEFAULT '',     -- 销售ID
  payment_method        TEXT DEFAULT '',     -- 付款方式
  payment_status        TEXT DEFAULT 'paid', -- paid/unpaid/partial
  contract_no           TEXT DEFAULT '',     -- 合同号
  expired_at            TEXT DEFAULT '',     -- 过期时间
  operator_id           TEXT DEFAULT '',     -- 操作人ID
  enrolled_at           TEXT,                -- 报名时间
  note                  TEXT DEFAULT '',
  created_at            TEXT DEFAULT (datetime('now'))
);
-- 索引
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_student_course ON enrollments(student_id, course_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);
```

> **计费模型核心规则**：
> - 课时挂在报名记录上，按课程独立核算（不是挂在学员身上）
> - 一个学员可报名多个课程；同一课程可多次续费报名（多条 enrollment）
> - **点名扣减规则**：赠课后扣 —— 到课先扣 `remaining_paid_hours`，扣完再扣 `remaining_gift_hours`；改缺勤先回退赠课
> - **结转**：把源 enrollment 剩余价值转移到目标 enrollment，支持按金额（折算）或按课时（平移）

#### transfers — 结转流水

```sql
CREATE TABLE transfers (
  id                    TEXT PRIMARY KEY,     -- trf_ 开头
  student_id            TEXT NOT NULL,
  from_enrollment_id    TEXT NOT NULL,        -- 源报名记录
  to_enrollment_id      TEXT NOT NULL,        -- 目标报名记录
  mode                  TEXT NOT NULL,        -- amount(按金额) / hours(按课时)
  transferred_hours     INTEGER NOT NULL DEFAULT 0,  -- 结转课时数
  transferred_amount    REAL NOT NULL DEFAULT 0,     -- 结转金额
  leftover_amount       REAL NOT NULL DEFAULT 0,     -- 找零（金额模式可能产生）
  from_unit_price       REAL NOT NULL DEFAULT 0,     -- 源单价
  to_unit_price         REAL NOT NULL DEFAULT 0,     -- 目标单价
  operator_id           TEXT DEFAULT '',
  reason                TEXT DEFAULT '',
  note                  TEXT DEFAULT '',
  created_at            TEXT DEFAULT (datetime('now'))
);
```

#### admins — 管理员账号

```sql
CREATE TABLE admins (
  id            TEXT PRIMARY KEY,        -- adm_ 开头
  username      TEXT NOT NULL UNIQUE,    -- 用户名（唯一）
  password_hash TEXT NOT NULL,           -- PBKDF2 哈希
  role          TEXT NOT NULL DEFAULT 'admin',  -- superadmin/admin/teacher
  real_name     TEXT DEFAULT '',         -- 真实姓名
  phone         TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',  -- active/disabled
  teacher_id    TEXT DEFAULT '',         -- 关联教师ID（预留）
  permissions   TEXT DEFAULT '',         -- 自定义权限（逗号分隔串，覆盖角色默认）
  last_login_at TEXT DEFAULT '',
  last_login_ip TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now')),
  created_by    TEXT DEFAULT ''
);
```

#### audit_logs — 审计日志

```sql
CREATE TABLE audit_logs (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT NOT NULL,        -- 操作者ID
  actor_name   TEXT NOT NULL,        -- 操作者用户名
  actor_role   TEXT NOT NULL,        -- 操作者角色
  action       TEXT NOT NULL,        -- create/update/delete/login 等
  module       TEXT NOT NULL,        -- students/courses/enrollments 等
  target_type  TEXT DEFAULT '',      -- 目标类型
  target_id    TEXT DEFAULT '',      -- 目标ID
  target_name  TEXT DEFAULT '',      -- 目标名称
  summary      TEXT DEFAULT '',      -- 摘要（人类可读）
  before_json  TEXT DEFAULT '',      -- 变更前快照 JSON
  after_json   TEXT DEFAULT '',      -- 变更后快照 JSON
  ip           TEXT DEFAULT '',      -- 操作者IP
  user_agent   TEXT DEFAULT '',      -- User-Agent
  created_at   TEXT DEFAULT (datetime('now'))
);
```

#### feedback — 课后反馈

```sql
CREATE TABLE feedback (
  id           TEXT PRIMARY KEY,        -- fdb_ 开头
  schedule_id  TEXT NOT NULL DEFAULT '',-- 关联排课ID
  course_id    TEXT NOT NULL DEFAULT '',
  teacher_id   TEXT DEFAULT '',
  teacher_name TEXT DEFAULT '',
  student_id   TEXT NOT NULL DEFAULT '',
  student_name TEXT DEFAULT '',
  date         TEXT NOT NULL DEFAULT '',
  content      TEXT DEFAULT '',         -- 反馈内容
  rating       INTEGER DEFAULT 0,       -- 评分 0-5
  created_at   TEXT DEFAULT (datetime('now'))
);
```

#### 其他表

- **announcement**：单行表（`id=1`），存储公告内容与更新时间
- **coupons** / **coupon_redemptions**：优惠券定义与核销记录
- **memberships** / **student_memberships**：会员卡类型与学员办卡记录
- **leads** / **lead_followups**：CRM 线索与跟进记录

### 4.3 数据迁移与兼容

`store.js` 在 `getDb()` 首次调用时：
1. 执行 `CREATE TABLE IF NOT EXISTS` 建所有表
2. 调用 `ensureColumn()` 为旧表补齐新增列（`ALTER TABLE ... ADD COLUMN`）
3. 调用 `rebuildStudentsTable()` 迁移旧 students 表（移除已废弃的 hours 字段）
4. 调用 `migrateLegacyAdminTable()` 迁移旧 admin 表（INTEGER id → TEXT id）

这意味着**新版本部署后无需手动迁移**，启动时自动升级到最新 schema。

---

## 5. 后端 API 完全指南

### 5.1 统一响应格式

所有 API 返回 JSON，统一结构：

```json
{
  "code": 0,          // 0=成功，非0=失败
  "message": "ok",    // 人类可读的消息
  "data": { ... }     // 数据载荷（失败时为 null）
}
```

HTTP 状态码：
- `200`：成功
- `400`：请求参数错误
- `401`：未登录或 token 过期
- `403`：权限不足 / 账号已禁用
- `404`：资源不存在
- `405`：不支持的请求方法
- `409`：资源冲突（如重复创建）
- `500`：服务端错误

### 5.2 认证与系统类

#### POST /api/auth — 登录

```json
// 请求
{ "username": "admin", "password": "123456" }

// 响应
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "base64url(payload).hex(sig)",
    "admin": {
      "id": "adm_xxx",
      "username": "admin",
      "role": "superadmin",
      "realName": "管理员",
      "permissions": ""
    }
  }
}
```

#### GET /api/auth — 校验 token

请求头携带 `Authorization: Bearer <token>`，返回当前用户信息。前端进入后台时调用，防止本地伪造 token。

#### POST /api/auth/bootstrap — 引导创建超管

仅在系统未初始化（admins 表为空）时可用。首次部署时前端会跳转到引导页。

#### GET /api/config — 读取系统配置（公开）

返回 `appName`、`renewalThreshold`、`backupKeepDays` 等。首屏加载时调用。

#### PUT /api/config — 修改系统配置（需 `settings:manage` 权限）

```json
{ "appName": "我的排课系统", "renewalThreshold": 5, "backupKeepDays": 30 }
```

### 5.3 学员管理类

#### GET /api/students — 学员列表/搜索（需 `students:view`）

| 参数 | 说明 |
|------|------|
| `q` | 搜索关键词（精确匹配 id/name 优先，模糊匹配其次） |

#### POST /api/student-add — 新增学员（需 `students:create`）

```json
{
  "student": {
    "name": "张三",
    "grade": "三年级",
    "phone": "13800138000",
    "parentName": "张父",
    "gender": "male",
    "birthday": "2015-06-01",
    "source": "地推",
    "tags": "VIP,试听",
    "remark": "对数学感兴趣"
  }
}
```

`id` 由后端自动生成（`stu_` 前缀）。

#### PUT /api/student-update — 更新学员（需 `students:update`）

姓名变更时，后端会级联更新所有排课中的 `student_name` 字段。

#### DELETE /api/student-delete — 删除学员（需 `students:delete`）

删除学员及其所有排课数据。body: `{ "studentId": "stu_xxx" }`

### 5.4 课程管理类

#### GET /api/courses — 课程列表（需登录）

#### POST /api/course-add — 新增课程（需 `courses:create`）

```json
{
  "course": {
    "name": "钢琴一对一",
    "teacher": "王老师",
    "location": "1号琴房",
    "defaultStartTime": "09:00",
    "defaultEndTime": "10:30",
    "unitPrice": 200,
    "billingType": "per_lesson",
    "capacity": 1,
    "category": "音乐",
    "description": "针对5-12岁儿童的钢琴启蒙课"
  }
}
```

#### DELETE /api/course-delete — 删除课程（需 `courses:delete`）

同时删除关联的排课记录。

### 5.5 排课与点名类

#### GET /api/schedules — 按学员查排课（需 `schedules:view`）

| 参数 | 说明 |
|------|------|
| `studentId` | 学员ID（与 studentName 至少传一个） |
| `studentName` | 学员姓名（按姓名反查ID） |
| `startDate` | 开始日期 yyyy-MM-dd |
| `endDate` | 结束日期 yyyy-MM-dd |

#### GET /api/schedules-search — 跨学员搜索排课（需登录）

后台筛选模式用，可按日期范围 + 课程筛选。

#### POST /api/schedule-add — 新增排课（需 `schedules:create`）

```json
{
  "schedule": {
    "studentId": "stu_xxx",
    "courseId": "crs_xxx",
    "courseName": "钢琴一对一",
    "teacher": "王老师",
    "location": "1号琴房",
    "date": "2026-07-10",
    "startTime": "09:00",
    "endTime": "10:30"
  }
}
```

`id` 由后端自动生成。`studentName` 后端自动补全。

#### POST /api/schedule-add-batch — 批量排课（需 `schedules:create`）

按课程为多个学员在多个日期同时排课（笛卡尔积）：

```json
{
  "courseId": "crs_xxx",
  "courseName": "钢琴一对一",
  "teacher": "王老师",
  "location": "1号琴房",
  "dates": ["2026-07-10", "2026-07-12", "2026-07-14"],
  "startTime": "09:00",
  "endTime": "10:30",
  "studentIds": ["stu_001", "stu_002"]
}
// → 为 2 个学员 × 3 个日期 = 6 条排课
```

#### POST /api/schedule-check-conflict — 排课冲突检测（需 `schedules:view`）

智能排课助手用，检测多个候选日期的教师/学员/教室冲突：

```json
{
  "studentId": "stu_xxx",
  "teacher": "王老师",
  "location": "1号琴房",
  "dates": ["2026-07-10", "2026-07-11"],
  "startTime": "09:00",
  "endTime": "10:30"
}

// 响应
{
  "code": 0,
  "data": {
    "results": [
      { "date": "2026-07-10", "conflicts": [] },                    // 空闲
      { "date": "2026-07-11", "conflicts": [                        // 有冲突
        {
          "type": "teacher",
          "field": "教师",
          "value": "王老师",
          "schedule": { /* 冲突的排课记录 */ }
        }
      ]}
    ],
    "total": 2,
    "free": 1,
    "conflict": 1
  }
}
```

冲突检测使用半开区间 `[start, end)` 判断时间重叠，分别检测三类冲突：
- **教师冲突**：同一教师在重叠时间段有其他排课
- **学员冲突**：同一学员在重叠时间段有其他排课
- **教室冲突**：同一教室在重叠时间段有其他排课

#### POST /api/attendance — 批量设置点名（需 `attendance:update`）

```json
{
  "date": "2026-07-10",
  "items": [
    { "scheduleId": "sch_001", "studentId": "stu_001", "attended": true },
    { "scheduleId": "sch_002", "studentId": "stu_002", "attended": false }
  ]
}
```

点名会自动扣减/回退课时（赠课后扣规则）。

### 5.6 报名与结转类

#### POST /api/enrollment-add — 新增报名（需 `enrollments:create`）

```json
{
  "enrollment": {
    "studentId": "stu_xxx",
    "courseId": "crs_xxx",
    "purchasedHours": 20,
    "giftHours": 2,
    "unitPrice": 200,
    "totalAmount": 4000,
    "paidAmount": 4000,
    "paymentMethod": "微信",
    "channel": "续费",
    "note": "暑期班续费"
  }
}
```

新增后 `remaining_paid_hours = purchasedHours`，`remaining_gift_hours = giftHours`。

#### PUT /api/enrollment-update — 更新报名（需 `enrollments:update`）

用于续费（`purchasedHours` 增量）、补赠课（`giftHours` 增量）、改单价、改状态。课时为"绝对值"语义：传入的新值与旧值之差即增量。

#### POST /api/transfer-add — 新增结转（需 `transfers:create`）

```json
{
  "transfer": {
    "studentId": "stu_xxx",
    "fromEnrollmentId": "enr_001",
    "toEnrollmentId": "enr_002",
    "mode": "amount",  // 或 "hours"
    "note": "转课"
  }
}
```

- **amount 模式**：把源报名的剩余金额按目标单价折算为课时，转入目标报名
- **hours 模式**：直接平移课时数

### 5.7 家长端专属 API

#### POST /api/share-link-generate — 生成家长端链接（需 `students:view`）

```json
// 请求
{ "studentId": "stu_xxx" }

// 响应
{
  "code": 0,
  "data": {
    "token": "base64url(payload).hex(sig)",
    "url": "/?s=stu_xxx&t=base64url.xxx"
  }
}
```

token 内含 `{ typ:'parent', sid:学员ID, ps:手机号后4位, ts:时间戳 }`，有效期 365 天。学员未登记手机号时返回 400 错误。

#### GET /api/parent-access — 校验 token（公开，token 自校验）

| 参数 | 说明 |
|------|------|
| `s` | 学员ID |
| `t` | 家长 token |

返回脱敏学员名（2字保留首字，3字以上保留首尾）+ 手机号后4位提示。

#### POST /api/parent-access — 二次校验手机号（公开，token 自校验）

```json
{
  "studentId": "stu_xxx",
  "token": "base64url.xxx",
  "phoneSuffix": "8000"  // 手机号后4位
}
```

校验通过后返回：学员信息 + 近期排课（过去30天+未来90天）+ 报名余额 + 教师反馈。

> **双层鉴权设计**：token 签名防止伪造链接，手机号后4位防止链接泄露被他人打开。两层都通过才返回完整数据。

### 5.8 其他 API

完整的 API 列表见 [第 11 节 API 速查表](#11-api-速查表)。

---

## 6. 鉴权与权限系统

### 6.1 Token 机制

**管理员 Token**：
- 格式：`base64url(payload).hex(signature)`
- payload：`{ uid, username, role, realName, ts }`
- 签名：HMAC-SHA256（密钥来自 `TOKEN_SECRET` 环境变量或 config.json）
- 有效期：24 小时
- 存储：前端 `localStorage.admin_token`

**家长 Token**：
- 格式与管理员相同，但 payload 含 `typ: 'parent'`
- payload：`{ typ:'parent', sid, ps, ts }`
- 有效期：365 天
- 与管理员 token 互不通用（`verifyToken` 检查 `typ` 字段）

**密码哈希**：
- 算法：PBKDF2-HMAC-SHA256
- 迭代次数：100,000 次
- Salt：每个密码独立生成
- 存储格式：`pbkdf2$iterations$saltBase64$hashBase64`

### 6.2 RBAC 权限模型

三级角色，权限粒度到"模块:操作"：

| 角色 | 权限范围 |
|------|----------|
| `superadmin` | 通配 `*`（拥有所有权限） |
| `admin` | 业务全权（学员/课程/报名/排课/点名/反馈/优惠券/会员卡/线索/报表/看板/设置） |
| `teacher` | 受限（查看排课/点名/学员/课程/报名/报表/反馈） |

**自定义权限覆盖**：
- `admins.permissions` 字段存储逗号分隔的权限串（如 `"students:view,students:create,schedules:view"`）
- 非空时**覆盖**角色默认权限；空串表示用角色默认
- 前端在管理员账号管理页面通过权限矩阵编辑器分配

**权限校验流程**（`requirePermission` 函数）：

```
1. requireAuth：校验 token 签名与有效期，注入 context.admin
2. 查库取最新 admin 记录（getAdminById）
3. 校验 status：disabled 账号直接拒绝（即使 token 未过期）
4. superadmin 放行
5. resolvePermissions：取自定义 permissions 或角色默认
6. hasPermission：判断是否包含目标权限点
7. 通过 → 返回 null；不通过 → 返回 403 Response
```

### 6.3 权限点清单（17 个模块）

| 模块 | 权限点 |
|------|--------|
| 学员管理 | `students:view`, `students:create`, `students:update`, `students:delete` |
| 课程管理 | `courses:view`, `courses:create`, `courses:update`, `courses:delete` |
| 报名管理 | `enrollments:view`, `enrollments:create`, `enrollments:update`, `enrollments:delete` |
| 结转管理 | `transfers:view`, `transfers:create` |
| 排课管理 | `schedules:view`, `schedules:create`, `schedules:update`, `schedules:delete` |
| 点名管理 | `attendance:view`, `attendance:update` |
| 教师管理 | `teachers:view` |
| 课后反馈 | `feedback:view`, `feedback:create`, `feedback:update`, `feedback:delete` |
| 公告管理 | `announcement:view`, `announcement:update` |
| 优惠券 | `coupons:view`, `coupons:create`, `coupons:update`, `coupons:delete` |
| 会员卡 | `memberships:view`, `memberships:create`, `memberships:update`, `memberships:delete` |
| 线索管理 | `leads:view`, `leads:create`, `leads:update`, `leads:delete` |
| 报表中心 | `reports:view` |
| 数据看板 | `dashboard:view` |
| 系统设置 | `settings:manage` |
| 管理员账号 | `admins:view`, `admins:create`, `admins:update`, `admins:delete` |
| 审计日志 | `audit:view` |

### 6.4 前端权限控制

前端通过 `src/utils/permission.ts` 的 `canSeeModule(admin, module)` 判断是否显示模块入口：

```typescript
// 基于当前登录用户的 role + permissions 判断
canSeeModule(currentAdmin, 'students')  // true/false
```

后台主界面 `AdminPanel.tsx` 按此过滤模块入口，无权限的模块不显示。

> **注意**：前端隐藏只是 UX 优化，真正的安全保障在后端 `requirePermission`。即使前端被绕过，后端也会返回 403。

---

## 7. 前端架构与组件

### 7.1 页面模式路由

`App.tsx` 根据 URL 切换三种页面模式：

| URL | 模式 | 组件 |
|-----|------|------|
| 默认（`/`） | `home` | `Home`（登录页 + 项目简介） |
| `/?s=学员ID&t=token` | `parent` | `ParentH5`（家长端 H5） |
| `/#admin` | `admin` | `AdminPanel`（管理后台） |

监听 `popstate` 事件重新判定模式。

### 7.2 后台模块分类

`AdminPanel.tsx` 将模块分为四个选项卡，按权限过滤入口：

| 选项卡 | 包含模块 |
|--------|----------|
| **教务** | 数据看板、学员管理、课程管理、报名管理、结转管理、排课管理、智能排课、点名管理、教师与反馈 |
| **营销** | 优惠券、会员卡、CRM线索 |
| **数据** | 报表中心、审计日志 |
| **系统** | 系统设置、管理员账号、家长专属链接、公告管理 |

### 7.3 前端 API 调用层

`src/api/admin.ts` 提供统一的 `request()` 封装：

```typescript
// 自动携带 Authorization: Bearer <token>
// 401 自动清除 token 跳登录
// 403 抛出友好错误
// 非 JSON 响应抛出"服务暂不可用"
async function request<T>(url, options): Promise<ApiResult<T>>
```

### 7.4 UI 组件库

`src/components/ui/` 提供统一的基础组件，通过 `index.tsx` 导出：

- **Button**：支持 `primary`/`danger`/`ghost`/`outline` 变体 + `loading` 状态
- **Modal**：模态框外壳，配合 `ModalFooter` 使用
- **Field**：表单字段外壳（label + 控件 + 提示）
- **toast**：命令式调用 `toast.success('保存成功')` / `toast.error('失败')`
- **confirmDialog**：命令式调用 `const ok = await confirmDialog({ title, message, danger })`
- **Pagination**：分页组件
- **EmptyState**：空状态
- **LoadingBlock**：加载中
- **SubPageHeader**：二级页面头部（返回 + 标题 + 操作区）

> **使用方式**：在应用根挂载一次 `<UIHost />` 即可启用全局 Toast/Confirm。

### 7.5 国际化

- 两种语言：中文（zh）和英文（en）
- `zh.ts` 定义 `TranslationSchema` 类型
- `en.ts` 通过 `import type { TranslationSchema } from './zh'` 强制与中文结构一致
- 语言切换：`LanguageSwitcher` 组件，持久化到 `localStorage.app_lang`
- 使用：`const { t } = useTranslation(); t('student.title')`

---

## 8. 核心业务流程

### 8.1 学员报名到上课的完整流程

```
1. 新增学员
   POST /api/student-add → stu_xxx

2. 新增课程
   POST /api/course-add → crs_xxx

3. 创建报名记录
   POST /api/enrollment-add
   → enr_xxx，remaining_paid_hours=20, remaining_gift_hours=2

4. 排课
   方式A：POST /api/schedule-add（单条）
   方式B：POST /api/schedule-add-batch（批量）
   方式C：智能排课助手（检测冲突后批量排入）

5. 上课当天点名
   POST /api/attendance
   → attended=true：扣减 remaining_paid_hours（先付费后赠课）
   → attended=false：不扣课时

6. 教师提交课后反馈
   POST /api/feedback
   → 关联 schedule_id，记录内容与评分

7. 课时不足时续费
   PUT /api/enrollment-update（purchasedHours 增量）

8. 转课/结转
   POST /api/transfer-add
   → 把源报名剩余价值转入新报名
```

### 8.2 课时扣减规则详解（赠课后扣）

点名 `attended = true` 时：

```
if (remaining_paid_hours > 0) {
  remaining_paid_hours -= 1
} else if (remaining_gift_hours > 0) {
  remaining_gift_hours -= 1
}
// 如果两者都为0，记录到错误列表但不报错
```

改缺勤 `attended: true → false` 时（回退）：

```
// 先回退赠课，再回退付费
if (remaining_gift_hours < gift_hours) {
  remaining_gift_hours += 1  // 回退赠课
} else {
  remaining_paid_hours += 1  // 回退付费
}
```

### 8.3 家长端访问流程

```
1. 管理员在后台生成专属链接
   POST /api/share-link-generate { studentId }
   → 返回 url: /?s=stu_xxx&t=token

2. 家长打开链接
   → ParentH5 从 URL 读取 s 和 t
   → 调用 GET /api/parent-access?s=stu_xxx&t=token
   → 返回脱敏学员名 + 手机号后4位提示

3. 家长输入手机号后4位
   → 调用 POST /api/parent-access { studentId, token, phoneSuffix }
   → 后端校验 token 签名 + 手机号后4位
   → 通过后返回：学员信息 + 排课 + 余额 + 反馈

4. 家长查看
   → 课时余额、即将上课、历史排课、教师反馈
   → 无返回首页、无搜索学员功能（只能看自己孩子）
```

### 8.4 智能排课助手流程

```
1. 选学员 + 选课程（自动带出教师/教室/默认时间）
2. 选日期：手动添加 或 按周重复生成（勾选周几 + 起止日期）
3. 点击"检测冲突"
   → POST /api/schedule-check-conflict
   → 返回每个日期的冲突详情
4. 查看结果：空闲日期（绿色）+ 冲突日期（红色，已自动排除）
5. 点击"排入 N 个空闲日期"
   → POST /api/schedule-add-batch（仅排入空闲日期）
   → 完成排课
```

---

## 9. 部署与运维

### 9.1 Docker 部署（推荐）

**方式一：使用 GHCR 预构建镜像**

```bash
# 1. 创建 docker-compose.yml（见仓库）
# 2. 启动
docker compose up -d

# 3. 查看日志
docker compose logs -f

# 4. 停止
docker compose down
```

**方式二：本地构建**

```bash
# 1. 克隆代码
git clone <repo-url>
cd pai-docker

# 2. 修改 docker-compose.yml，注释 image 行，取消注释 build 行
# 3. 构建并启动
docker compose up -d --build
```

**方式三：直接 docker 命令**

```bash
docker run -d \
  --name pai \
  -p 8788:8788 \
  -v pai-data:/app/data \
  --restart unless-stopped \
  ghcr.io/mxlitey/pai-docker:latest
```

### 9.2 本地开发部署

```bash
# 1. 安装依赖
npm install

# 2. 开发模式（前端热更新 + 后端）
# 终端1：启动后端
npm run server

# 终端2：启动前端开发服务器（代理到后端）
npm run dev

# 3. 生产模式
npm run build    # 构建前端到 dist/
npm run start    # 构建并启动
```

### 9.3 首次初始化

1. 浏览器打开 `http://localhost:8788`
2. 系统检测到未初始化，自动跳转引导页
3. 设置超级管理员用户名和密码
4. 创建成功后跳转登录页，用超管账号登录

### 9.4 数据备份与恢复

**自动备份**：服务器启动时和每日凌晨自动创建备份，按 `backupKeepDays` 配置自动清理过期备份。

**手动备份**：后台 → 系统设置 → 数据备份与恢复 → 立即备份

**恢复**：选择备份文件 → 恢复（恢复前会自动创建当前状态快照）

**备份文件位置**：`data/backups/pai_YYYYMMDD_HHmmss.db`

### 9.5 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8788` | 服务监听端口 |
| `DATA_DIR` | `./data` | 数据目录（数据库 + 配置 + 备份） |
| `NODE_ENV` | `production` | Node 环境 |
| `TOKEN_SECRET` | （config.json 随机生成） | Token 签名密钥 |

### 9.6 GitHub Actions 自动构建

`.github/workflows/docker-publish.yml` 在 push 到 main 时自动：
1. 构建 Docker 镜像（多阶段）
2. 推送到 `ghcr.io/mxlitey/pai-docker:latest`
3. 同时打 `latest` 和 git commit short SHA 两个标签

---

## 10. 开发指南

### 10.1 新增一个 API

**场景**：新增一个"导出学员 CSV"的 API

1. 创建 `node-functions/api/student-export.js`：

```javascript
// GET /api/student-export — 导出学员CSV
import { getStudents, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'students:view')
  if (authFail) return authFail

  const students = await getStudents()
  // 生成 CSV...
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' }
  })
}
```

2. 前端调用：

```typescript
// src/api/admin.ts
export async function exportStudents() {
  return request(`${API_BASE}/student-export`, { method: 'GET' })
}
```

3. 完成。路由自动映射，无需注册。

### 10.2 新增一个数据库表

1. 在 `store.js` 的 `getDb()` 函数的 `db.exec()` 中添加建表语句：

```javascript
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);
```

2. 添加 `rowToNotification` 映射函数和 CRUD 函数
3. 添加 ID 生成器到 `id.js`：`export const genNotificationId = () => makeId('ntf_')`
4. 重启服务，表会自动创建

### 10.3 新增一个前端页面

1. 在 `src/components/Admin/` 创建组件文件：

```tsx
// src/components/Admin/NotificationAdmin.tsx
import { useState } from 'react'
import { SubPageHeader, LoadingBlock, EmptyState } from '@/components/ui'

interface Props {
  onBack: () => void
}

export function NotificationAdmin({ onBack }: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title="通知管理" onBack={onBack} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* 内容 */}
      </main>
    </div>
  )
}
```

2. 在 `AdminPanel.tsx` 中注册入口（选择对应选项卡 + 权限过滤）

3. 在 `src/i18n/zh.ts` 和 `en.ts` 中添加翻译键

### 10.4 代码规范

- **后端**：ES Module（`import/export`），所有数据库操作走 `store.js`
- **前端**：TypeScript 严格模式，组件用函数式 + Hooks
- **样式**：Tailwind CSS 原子类，自定义颜色用 `brand-*` 前缀
- **命名**：后端 snake_case（数据库字段）→ camelCase（JS 对象），前端全 camelCase
- **权限**：每个 API 必须调用 `requirePermission`，前端入口必须用 `canSeeModule` 过滤

### 10.5 调试技巧

**后端日志**：`console.error` 会输出到 Docker 日志（`docker compose logs -f`）

**数据库调试**：

```bash
# 进入容器
docker exec -it pai sh

# 用 sqlite3 查看（如已安装）
sqlite3 /app/data/pai.db
.tables
.schema students
SELECT * FROM students LIMIT 5;
```

**前端调试**：Chrome DevTools → Application → Local Storage 查看 `admin_token` 和 `current_admin`

---

## 11. API 速查表

### 认证与系统

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/auth` | 公开 | 登录 |
| GET | `/api/auth` | requireAuth | 校验 token |
| POST | `/api/auth/bootstrap` | 公开 | 引导创建超管 |
| GET | `/api/auth/bootstrap` | 公开 | 查询引导状态 |
| GET | `/api/config` | 公开 | 读取配置 |
| PUT | `/api/config` | settings:manage | 修改配置 |
| GET | `/api/permission-definitions` | admins:view | 权限矩阵定义 |
| GET | `/api/backups` | settings:manage | 备份列表 |
| POST | `/api/backups` | settings:manage | 创建备份 |
| DELETE | `/api/backups` | settings:manage | 删除备份 |
| POST | `/api/backups/restore` | settings:manage | 恢复备份 |
| POST | `/api/expire` | enrollments:update | 过期报名扫描 |
| GET | `/api/audit-logs` | audit:view | 审计日志查询 |

### 管理员账号

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admins` | admins:view | 账号列表 |
| POST | `/api/admin-add` | admins:create | 新增账号 |
| PUT | `/api/admin-update` | admins:update | 更新账号 |
| DELETE | `/api/admin-delete` | admins:delete | 删除账号 |

### 学员管理

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/students` | students:view | 学员列表/搜索 |
| POST | `/api/student-add` | students:create | 新增学员 |
| PUT | `/api/student-update` | students:update | 更新学员 |
| DELETE | `/api/student-delete` | students:delete | 删除学员 |
| POST | `/api/share-link-generate` | students:view | 生成家长端链接 |
| GET | `/api/parent-access` | 公开(token) | 家长端校验 |
| POST | `/api/parent-access` | 公开(token) | 家长端二次校验 |

### 课程管理

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/courses` | requireAuth | 课程列表 |
| POST | `/api/course-add` | courses:create | 新增课程 |
| PUT | `/api/course-update` | courses:update | 更新课程 |
| DELETE | `/api/course-delete` | courses:delete | 删除课程 |

### 报名与结转

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/enrollments` | requireAuth | 报名列表 |
| POST | `/api/enrollment-add` | enrollments:create | 新增报名 |
| POST | `/api/enrollment-batch` | enrollments:create | 批量报名 |
| PUT | `/api/enrollment-update` | enrollments:update | 更新报名 |
| DELETE | `/api/enrollment-delete` | enrollments:delete | 删除报名 |
| GET | `/api/transfers` | requireAuth | 结转流水 |
| POST | `/api/transfer-add` | transfers:create | 新增结转 |

### 排课与点名

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/schedules` | schedules:view | 按学员查排课 |
| GET | `/api/schedules-search` | requireAuth | 跨学员搜索 |
| POST | `/api/schedule-add` | schedules:create | 新增排课 |
| POST | `/api/schedule-add-batch` | schedules:create | 批量排课 |
| PUT | `/api/schedule-update` | schedules:update | 修改排课 |
| DELETE | `/api/schedule-delete` | schedules:delete | 删除排课 |
| POST | `/api/schedule-check-conflict` | schedules:view | 冲突检测 |
| GET | `/api/attendance` | requireAuth | 点名列表 |
| POST | `/api/attendance` | attendance:update | 批量点名 |

### 反馈与教师

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/feedback` | feedback:view | 反馈列表 |
| POST | `/api/feedback` | feedback:create | 新增反馈 |
| PUT | `/api/feedback` | feedback:update | 更新反馈 |
| DELETE | `/api/feedback` | feedback:delete | 删除反馈 |
| GET | `/api/teacher-performance` | reports:view | 教师绩效 |

### 公告

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/announcement` | 公开 | 读取公告 |
| POST | `/api/announcement` | announcement:update | 保存公告 |

### 营销与 CRM

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET/POST/PUT/DELETE | `/api/coupons` | coupons:* | 优惠券管理 |
| GET/POST/PUT/DELETE | `/api/memberships` | memberships:* | 会员卡类型 |
| GET/POST/DELETE | `/api/student-memberships` | memberships:* | 学员办卡 |
| GET/POST/PUT/DELETE | `/api/leads` | leads:* | 线索管理 |
| GET/POST | `/api/followups` | leads:view/update | 线索跟进 |

### 报表

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/reports` | reports:view | 多维报表 |

报表类型（`type` 参数）：
- `revenue` — 营收报表
- `hours-consumption` — 课时消耗
- `hours-balance` — 课时余额
- `attendance-rate` — 出勤率
- `transfers` — 结转报表
- `enrollment-stats` — 报名统计

---

## 12. FAQ 与常见问题

### Q1: 忘记超管密码怎么办？

目前没有密码找回功能。解决方案：
1. 停止服务
2. 删除 `data/pai.db`（会丢失所有数据！）
3. 重启服务，重新走引导流程

**建议**：至少创建两个超管账号互为备份。

### Q2: 如何修改默认端口？

```bash
# 环境变量
PORT=3000 node server.js

# 或 docker-compose.yml
environment:
  PORT: "3000"
ports:
  - "3000:3000"
```

### Q3: 数据库文件在哪？如何备份？

数据库文件：`data/pai.db`
配置文件：`data/config.json`
备份目录：`data/backups/`

**手动备份**：直接复制 `data/pai.db` 文件即可（SQLite 单文件即完整数据库）。

### Q4: 如何切换语言？

首页或后台右上角有语言切换按钮，切换后持久化到 `localStorage.app_lang`。

### Q5: 家长端链接过期了怎么办？

家长 token 有效期 365 天。过期后需管理员重新生成链接：
后台 → 系统设置 → 家长专属链接 → 找到对应学员 → 复制链接

### Q6: 如何给教师分配只能看自己班级的权限？

1. 创建一个 teacher 角色账号
2. 在管理员账号管理中编辑该账号
3. 在权限矩阵中只勾选需要的权限点（如 `schedules:view` + `attendance:update` + `feedback:create`）
4. 保存后该账号登录只能看到有权限的模块

### Q7: 点名后课时扣错了怎么办？

可以手动修改报名记录：后台 → 报名管理 → 找到对应报名 → 编辑 → 修改 `remainingPaidHours` 或 `remainingGiftHours`。

### Q8: 如何升级到新版本？

```bash
# Docker 部署
docker compose pull    # 拉取最新镜像
docker compose up -d   # 重启容器（数据自动迁移）

# 本地部署
git pull
npm install
npm run build
npm run start
```

数据库 schema 会在启动时自动升级，无需手动迁移。

### Q9: 如何查看系统操作日志？

后台 → 数据 → 审计日志。可按操作者、模块、动作、日期范围筛选。每个写操作都会记录变更前后的 JSON 快照。

### Q10: 如何开发新的通知功能（如微信通知）？

建议在 `node-functions/_lib/` 新建 `notify.js`，抽象通知渠道：

```javascript
// notify.js 示例架构
export async function notify(channel, { to, title, content }) {
  switch (channel) {
    case 'webhook': return await sendWebhook(/* ... */)
    case 'email': return await sendEmail(/* ... */)
    case 'sms': return await sendSms(/* ... */)
  }
}
```

然后在业务侧（点名完成、排课变更等）调用 `notify()`，系统配置中存渠道开关与密钥。

---

> **文档版本**：2026-07-09
> **项目仓库**：[GitHub](https://github.com/mxlitey/pai-docker)
> **Docker 镜像**：`ghcr.io/mxlitey/pai-docker:latest`
