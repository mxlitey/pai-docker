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

- **基础教务**：学员档案、年级、班级、课程、教师管理
- **教学运营**：报名购课、排课、点名（赠课后扣规则）、调课补课、退课结转
- **财务核算**：账户余额、退课折算、报名金额、续费预警
- **数据洞察**：报表中心（营收/课时消耗/课时余额/出勤率/结转/报名统计）、教师绩效
- **多方协作**：管理员后台（RBAC 细粒度权限）、教师端（课后反馈/绩效）、家长端 H5（专属链接查看孩子课表与余额）
- **运维保障**：审计日志（按月 gzip 归档）、自动备份与恢复、安全响应头、限流防爆破

### 1.2 设计理念

| 理念 | 说明 |
|------|------|
| **单文件部署** | 整个后端就是一个 `node server.js`，数据库是单个 SQLite 文件，无需额外中间件 |
| **按文件名路由** | `node-functions/api/students.js` 自动映射为 `/api/students`，新增 API 只需加文件 |
| **Edge Functions 风格** | 每个处理函数接收 `{ request, env, remoteAddress }` 上下文，返回 Web Response |
| **前后端同源** | 后端同时托管 `dist/` 静态资源和 API，无跨域问题 |
| **数据安全** | 所有写操作审计留痕，RBAC 细粒度权限，家长端双层鉴权，限流防爆破 |
| **零配置启动** | 超管账号首次访问引导创建，token 密钥自动生成，配置走 config.json |

### 1.3 三种用户角色与入口

| 角色 | 入口 | 能力 |
|------|------|------|
| **超管 / 管理员 / 教师** | 首页登录 → 后台 `#admin` | 按分配的权限操作对应模块 |
| **家长** | 专属链接 `?s=学员ID&t=token` | 仅查看自己孩子的排课、课时余额、教师反馈 |

---

## 2. 技术栈与架构

### 2.1 技术栈

**前端**：
- React 18 + TypeScript 5 + Vite 5
- Tailwind CSS 3（原子化样式）+ shadcn/ui 组件库
- react-markdown + remark-gfm（公告 Markdown 渲染）
- date-fns 3（日期处理）
- lucide-react（图标库）

**后端**：
- Node.js 20（原生 HTTP Server，无 Express/Koa）
- better-sqlite3 11（同步 SQLite 驱动，WAL 模式）
- Web Crypto API（HMAC-SHA256 签名、PBKDF2 密码哈希）

**部署**：
- Docker + Docker Compose
- GitHub Actions 自动构建多架构镜像（amd64/arm64）推送到 GHCR
- 多阶段构建，最终镜像以非 root 用户运行

> **为什么选 SQLite 而不是 MySQL/PostgreSQL？**
> 教培机构数据量通常在万级以下，SQLite 的单文件部署、零运维、WAL 并发模式完全够用。`better-sqlite3` 的同步 API 也避免了 async/await 的回调地狱，代码更简洁。如果未来需要横向扩展，store 层的数据访问抽象可平滑迁移到其他数据库。

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
│  ┌─────────────────┐  ┌───────────────────┐ │
│  │  静态资源托管   │  │  API 路由分发      │ │
│  │  (dist/ → SPA)  │  │  (/api/* → 处理器) │ │
│  └─────────────────┘  └────────┬──────────┘ │
│                                │             │
│                ┌───────────────┼──────────┐ │
│                ▼               ▼          ▼ │
│  ┌──────────┐ ┌──────────────┐ ┌────────┐ │
│  │ auth.js  │ │ store/*.js   │ │audit.js│ │
│  │ (鉴权)   │ │ (数据层14表) │ │(审计)  │ │
│  └──────────┘ └──────┬───────┘ └────┬───┘ │
│                      │              │      │
│                      ▼              ▼      │
│              ┌──────────────┐  ┌────────┐  │
│              │  SQLite      │  │archive │  │
│              │  (pai.db WAL)│  │(*.json.gz)│
│              └──────────────┘  └────────┘  │
└──────────────────────────────────────────────┘
```

### 2.3 请求生命周期（一个 API 请求经历了什么）

以 `POST /api/student-add` 为例：

```
1. 浏览器 fetch('/api/student-add', { method:'POST', body:..., headers:{Authorization:'Bearer xxx'} })
   ↓
2. server.js 收到请求，pathname='/api/student-add'
   ↓
3. 请求体大小检查（>2MB 拒绝 413）；恢复期间写操作阻塞（503）
   ↓
4. matchApiRoute() 按文件名匹配到 node-functions/api/student-add.js
   ↓
5. toWebRequest() 把 Node IncomingMessage 转成 Web Request 对象
   ↓
6. 构造 context = { request, env, remoteAddress: req.socket.remoteAddress }
   ↓
7. 调用 mod.default(context) 或 mod.onRequestPost(context)
   ↓
8. student-add.js 内部：
   a. requirePermission(context, 'students:create')
      → auth.js 校验 token 签名 → 查库取最新角色/权限/状态 → 判断是否拥有 students:create
      → 用 DB 最新角色覆写 context.admin.role（防降级后旧 token 越权读取）
   b. 读取 request.json() 获取 body
   c. 调用 store/students.js 的 addStudent() 写入 SQLite
   d. 调用 audit.js 的 writeAudit() 记录审计日志
   e. 返回 json({ code:0, message:'学员已新增', data:{ student } })
   ↓
9. server.js 写回响应 + 安全响应头（CSP / nosniff / DENY / Referrer-Policy）
   ↓
10. 浏览器收到 JSON 响应
```

---

## 3. 目录结构详解

```
/workspace
├── server.js                    # Node HTTP 服务器入口（路由分发 + 静态资源托管 + 安全头）
├── package.json                 # 依赖与脚本
├── Dockerfile                   # 多阶段构建定义（非 root 用户运行）
├── docker-compose.yml           # Docker Compose 部署配置
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 构建配置
├── tailwind.config.js           # Tailwind CSS 配置
│
├── node-functions/              # ===== 后端代码 =====
│   ├── _lib/                    # 后端核心库
│   │   ├── auth.js              # 鉴权（token/校验、RBAC 权限模型、PBKDF2 哈希、限流 IP 提取）
│   │   ├── audit.js             # 审计日志写入助手
│   │   ├── config-file.js       # 系统配置读写（config.json 7 项配置）
│   │   ├── cron.js              # cron 表达式解析（备份调度用）
│   │   ├── id.js                # ID 生成器（前缀+时间戳+计数器+随机）
│   │   ├── rate-limit.js        # 内存滑动窗口限流（登录/家长端校验）
│   │   ├── store.js             # 数据访问层 re-export（聚合 store/ 下各模块）
│   │   ├── time.js              # 时区工具（统一 Asia/Shanghai）
│   │   └── store/               # 各业务表的数据访问模块
│   │       ├── core.js          # SQLite 连接 + 14 张表 schema + 兼容迁移
│   │       ├── students.js      # 学员档案 + deleteStudentWithSchedules（保留历史）
│   │       ├── courses.js       # 课程
│   │       ├── grades.js        # 年级（主数据，可批量升班）
│   │       ├── classes.js       # 班级 + 班级成员
│   │       ├── schedules.js     # 排课 + 补课查询
│   │       ├── enrollments.js   # 报名记录（计费核心）
│   │       ├── transfers.js     # 退课结转流水
│   │       ├── accounts.js      # 账户余额流水
│   │       ├── attendance.js    # 点名（赠课后扣规则）
│   │       ├── feedback.js      # 课后反馈
│   │       ├── teachers.js      # 教师（账号 teacherId 关联）
│   │       ├── reports.js       # 6 种报表类型
│   │       ├── admins.js        # 管理员账号（不返回 lastLoginIp）
│   │       ├── audit.js         # 审计日志查询
│   │       ├── audit-archive.js # 审计按月 gzip 归档
│   │       ├── announcements.js # 公告（单行）
│   │       ├── backups.js       # VACUUM INTO 备份 + 恢复（阻塞写）
│   │       └── schedule-changes.js # 调课记录
│   │
│   └── api/                     # API 处理器（按文件名自动映射路由，共 51 个）
│       ├── auth.js              # /api/auth 登录/校验/bootstrap
│       ├── parent-access.js     # /api/parent-access 家长端 H5（限流）
│       ├── students.js          # /api/students 学员搜索
│       ├── student-add.js       # /api/student-add
│       ├── student-update.js
│       ├── student-delete.js    # 删除学员（保留历史数据）
│       ├── courses.js
│       ├── course-add.js / course-update.js / course-delete.js
│       ├── grades.js / grade-add.js / grade-update.js / grade-delete.js / grade-promote.js
│       ├── classes.js / class-add.js / class-update.js / class-delete.js / class-members.js
│       ├── schedules.js / schedules-search.js
│       ├── schedule-add.js / schedule-add-batch.js / schedule-update.js / schedule-delete.js
│       ├── schedule-makeup.js   # 补课
│       ├── schedule-reschedule.js # 调课
│       ├── schedule-changes.js  # 调课记录查询
│       ├── attendance.js        # 点名（赠课后扣）
│       ├── enrollments.js / enrollment-add.js / enrollment-update.js / enrollment-delete.js
│       ├── transfers.js / transfer-add.js  # 退课结转
│       ├── account-transactions.js # 账户流水
│       ├── feedback.js          # 课后反馈
│       ├── teacher-performance.js # 教师绩效
│       ├── admins.js / admin-add.js / admin-update.js / admin-delete.js
│       ├── permission-definitions.js # 权限定义（供前端渲染权限矩阵）
│       ├── announcement.js      # 公告
│       ├── config.js            # 系统配置
│       ├── reports.js           # 6 种报表
│       ├── audit-logs.js        # 审计日志查询
│       ├── audit-archives.js    # 审计归档下载/列表
│       ├── backups.js           # 备份列表/创建/恢复/删除
│       └── expire.js            # 报名过期检查（cron 调用）
│
├── src/                         # ===== 前端代码 =====
│   ├── main.tsx                 # 应用入口
│   ├── App.tsx                  # 根组件（页面模式路由：home/parent/admin）
│   ├── config.ts                # 前端配置（appName 内存缓存）
│   ├── api/                     # 前端 API 调用层
│   │   ├── index.ts             # 公共 API（学员搜索、排课查询、家长端、配置）
│   │   └── admin.ts             # 管理后台 API（带鉴权 token）
│   ├── types/index.ts           # TypeScript 类型定义（25+ 接口）
│   ├── hooks/use-mobile.ts      # 响应式 hook
│   ├── utils/
│   │   ├── cn.ts                # className 合并
│   │   ├── permission.ts        # 前端权限判断（ROLE_DEFAULT_VIEW_PERMISSIONS）
│   │   ├── cron.ts              # cron 表达式解析（前端校验）
│   │   ├── date.ts / tz.ts      # 日期/时区工具
│   │   ├── money.ts             # 金额格式化
│   │   ├── courseColors.ts      # 10 色颜色映射
│   │   └── auth.ts              # 401 错误判断
│   └── components/
│       ├── Admin/               # 后台管理组件（19 个子页面）
│       │   ├── AdminPanel.tsx   # 后台主框架（侧边栏 4 分类 + 14 模块入口）
│       │   ├── AdminLogin.tsx   # 登录页
│       │   ├── Bootstrap.tsx    # 超管引导创建页
│       │   ├── StudentAdmin.tsx / CourseAdmin.tsx / GradeAdmin.tsx / ClassesAdmin.tsx
│       │   ├── EnrollmentAdmin.tsx / TransferAdmin.tsx
│       │   ├── ScheduleAdmin.tsx / ScheduleAddModal.tsx / ScheduleEditor.tsx / RescheduleModal.tsx
│       │   ├── AttendanceAdmin.tsx
│       │   ├── AnnouncementAdmin.tsx / ShareLinksAdmin.tsx
│       │   ├── AdminUserAdmin.tsx / AuditLogAdmin.tsx
│       │   ├── ReportsAdmin.tsx / TeacherAdmin.tsx
│       │   └── SystemSettingsAdmin.tsx
│       ├── Calendar/            # 日历视图（月/周/日三视图）
│       ├── Home/Home.tsx        # 首页
│       ├── Parent/ParentH5.tsx  # 家长端 H5
│       ├── Announcement/Announcement.tsx  # 公告弹窗
│       ├── ui/                  # 基础 UI + shadcn 组件
│       ├── SearchBar.tsx        # 学员搜索框
│       ├── ScheduleCard.tsx     # 排课卡片
│       └── ScheduleDetail.tsx   # 排课详情
│
├── scripts/
│   └── test_suite.py            # 端到端测试套件（Python requests，192+ 测试项）
│
├── dist/                        # 前端构建产物（gitignore）
├── data/                        # 数据目录（gitignore）
│   ├── pai.db / pai.db-wal / pai.db-shm  # SQLite + WAL
│   ├── config.json              # 系统配置（含 tokenSecret）
│   ├── backups/                 # 数据库备份文件
│   └── audit_archive/           # 审计日志按月 gzip 归档
│
└── .github/workflows/
    └── docker-publish.yml       # GitHub Actions：多架构构建推送 GHCR
```

### 3.1 关键设计约定

**后端路由映射规则**（`server.js` 第 80-94 行）：

```
/api/students              → node-functions/api/students.js
/api/auth/bootstrap        → node-functions/api/auth.js（从右向左逐段去路径匹配父路由）
/api/backups/restore       → node-functions/api/backups.js
```

匹配策略：先精确匹配 `apiModules[pathname]`，匹配不到则从右向左逐段去掉路径段尝试父路由。

**处理器导出形式**（两种均可）：

```javascript
// 形式1：default 函数，内部自行判断 method
export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'GET') return handleGet(context)
  if (request.method === 'POST') return handlePost(context)
}

// 形式2：按方法分别导出
export async function onRequestGet(context) { /* ... */ }
export async function onRequestPost(context) { /* ... */ }
```

**store 层模块化**：`node-functions/_lib/store/` 下按业务实体拆分为 18 个文件，`store.js` 统一 re-export，避免业务模块相互 import 形成循环依赖。

---

## 4. 数据库设计（数据模型）

数据库文件：`data/pai.db`（SQLite），使用 WAL 模式（读不阻塞写），`foreign_keys = ON`。

### 4.1 表清单总览

| 表名 | 用途 | ID 前缀 | 主要关联 |
|------|------|---------|----------|
| `students` | 学员档案（含账户余额 balance） | `stu_` | — |
| `courses` | 课程定义（含 billing_type 单价等） | `crs_` | grade |
| `grades` | 年级（主数据，可批量升班） | `grd_` | — |
| `classes` | 班级（关联课程 + 固定学员名单） | `cls_` | course_id, grade |
| `class_members` | 班级成员（多对多） | — | class_id, student_id |
| `schedules` | 排课记录（含补课/调课/扣减关联） | `sch_` | student_id, course_id, class_id |
| `enrollments` | 报名记录（计费核心） | `enr_` | student_id, course_id |
| `account_transactions` | 账户余额流水 | `atx_` | student_id |
| `transfers` | 退课结转流水 | `trf_` | from_enrollment_id, to_enrollment_id |
| `admins` | 管理员账号（含 RBAC） | `adm_` | — |
| `audit_logs` | 审计日志（按月归档） | `aud_` | actor_id |
| `announcement` | 公告（单行，id=1） | — | — |
| `feedback` | 课后反馈 | `fdb_` | schedule_id, teacher_id, student_id, course_id |
| `schedule_changes` | 调课记录 | `chg_` | original_schedule_id, new_schedule_id |

### 4.2 各表字段详解

#### students — 学员档案

```sql
CREATE TABLE students (
  id           TEXT PRIMARY KEY,        -- stu_ 开头
  name         TEXT NOT NULL,           -- 姓名
  grade        TEXT DEFAULT '',         -- 年级文本（引用 grades.name）
  phone        TEXT DEFAULT '',         -- 家长手机号（家长端鉴权用）
  parent_name  TEXT DEFAULT '',
  gender       TEXT DEFAULT '',
  birthday     TEXT DEFAULT '',
  status       TEXT DEFAULT 'active',   -- active/inactive/graduated
  tags         TEXT DEFAULT '',         -- 逗号分隔标签
  remark       TEXT DEFAULT '',
  source       TEXT DEFAULT '',         -- 来源
  balance      REAL NOT NULL DEFAULT 0, -- 账户余额（退课折算入此）
  created_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
```

> **删除学员策略**：保留 `enrollments`、`transfers`、`account_transactions`、已点名排课（`attended IS NOT NULL`），仅删除未点名排课、班级成员关系、反馈、调课记录。避免删除后报表失真。
> 详见 [deleteStudentWithSchedules](node-functions/_lib/store/students.js)。

#### courses — 课程定义

```sql
CREATE TABLE courses (
  id           TEXT PRIMARY KEY,                  -- crs_ 开头
  name         TEXT NOT NULL,
  color        TEXT DEFAULT '',                   -- 10 色颜色 key
  billing_type TEXT DEFAULT 'per_lesson',         -- per_lesson/per_term/per_month
  term         TEXT DEFAULT '',                   -- 学期
  status       TEXT DEFAULT 'active',
  category     TEXT DEFAULT '',
  grade        TEXT DEFAULT '',                   -- 关联年级
  description  TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
```

> 课程不再有 `teacher` / `location` / `unit_price` / `capacity` 等字段（已迁移到 classes 和 enrollments）。

#### grades — 年级（主数据）

```sql
CREATE TABLE grades (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,   -- 年级名称
  sort_order  INTEGER DEFAULT 0,      -- 排序
  status      TEXT DEFAULT 'active',
  description TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_grades_sort ON grades(sort_order);
```

支持**批量升班**（grade-promote.js）：将指定年级的所有学员与课程的 `grade` 文本字段升级到下一年级。

#### classes — 班级

```sql
CREATE TABLE classes (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  course_id          TEXT NOT NULL DEFAULT '',   -- 关联课程
  grade              TEXT DEFAULT '',
  teacher            TEXT DEFAULT '',            -- 教师姓名
  location           TEXT DEFAULT '',
  color              TEXT DEFAULT '',
  default_start_time TEXT DEFAULT '',            -- HH:mm
  default_end_time   TEXT DEFAULT '',
  capacity           INTEGER DEFAULT 0,          -- 0=不限
  status             TEXT DEFAULT 'active',
  remark             TEXT DEFAULT '',
  created_at         TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_classes_course ON classes(course_id);
CREATE INDEX idx_classes_grade ON classes(grade);
```

#### class_members — 班级成员

```sql
CREATE TABLE class_members (
  class_id   TEXT NOT NULL,
  student_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX idx_class_members_student ON class_members(student_id);
```

#### schedules — 排课记录

```sql
CREATE TABLE schedules (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL,
  student_name TEXT NOT NULL,           -- 冗余，避免连表
  class_id     TEXT DEFAULT '',
  course_id    TEXT DEFAULT '',
  course_name  TEXT NOT NULL,           -- 冗余
  teacher      TEXT DEFAULT '',
  location     TEXT DEFAULT '',
  date         TEXT NOT NULL,           -- yyyy-MM-dd
  start_time   TEXT DEFAULT '',         -- HH:mm
  end_time     TEXT DEFAULT '',
  note         TEXT DEFAULT '',
  color        TEXT DEFAULT '',
  attended     INTEGER,                 -- 1=到课 0=缺勤 NULL=未点名
  status       TEXT DEFAULT 'scheduled', -- scheduled/completed/cancelled/makeup
  room         TEXT DEFAULT '',
  makeup_for   TEXT DEFAULT '',         -- 补课关联的原排课ID
  rescheduled_from TEXT DEFAULT '',     -- 调课来源
  deducted_enrollment_id TEXT DEFAULT '', -- 点名扣的是哪条报名
  deducted_type TEXT DEFAULT '',        -- 扣的是 paid 还是 gift
  created_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_schedules_student_date ON schedules(student_id, date);
CREATE INDEX idx_schedules_date ON schedules(date);
CREATE INDEX idx_schedules_student ON schedules(student_id);
CREATE INDEX idx_schedules_course ON schedules(course_id);
CREATE INDEX idx_schedules_class ON schedules(class_id);
```

> **deducted_enrollment_id / deducted_type**：点名扣课时记录扣的是哪条报名、扣的付费还是赠课，回退时精准回退（修复回退到错误报名/错误课时类型）。

#### enrollments — 报名记录（计费核心）

```sql
CREATE TABLE enrollments (
  id                    TEXT PRIMARY KEY,
  student_id            TEXT NOT NULL,
  course_id             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active', -- active/settled/expired
  purchased_hours       INTEGER NOT NULL DEFAULT 0,
  gift_hours            INTEGER NOT NULL DEFAULT 0,
  remaining_paid_hours  INTEGER NOT NULL DEFAULT 0,
  remaining_gift_hours  INTEGER NOT NULL DEFAULT 0,
  unit_price            REAL NOT NULL DEFAULT 0,
  total_amount          REAL NOT NULL DEFAULT 0,
  paid_amount           REAL NOT NULL DEFAULT 0,
  discount_amount       REAL NOT NULL DEFAULT 0,
  payment_method        TEXT DEFAULT '',
  payment_status        TEXT DEFAULT 'paid',  -- paid/unpaid/partial
  contract_no           TEXT DEFAULT '',
  expired_at            TEXT DEFAULT '',
  operator_id           TEXT DEFAULT '',
  enrolled_at           TEXT,
  note                  TEXT DEFAULT '',
  created_at            TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_student_course ON enrollments(student_id, course_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);
-- 点名热路径：按学员+课程+状态过滤并按 enrolled_at 排序定位最早一条 active 报名
CREATE INDEX idx_enrollments_stu_course_status_enrolled ON enrollments(student_id, course_id, status, enrolled_at);
```

> **计费模型**：课时挂在「报名记录 enrollment」上，按课程独立核算。一个学员可报名多个课程；同一课程可多次续费报名。点名扣减规则：**赠课后扣** —— 到课先扣付费剩余，扣完再扣赠课；改缺勤先回退赠课。

#### account_transactions — 账户余额流水

```sql
CREATE TABLE account_transactions (
  id              TEXT PRIMARY KEY,
  student_id      TEXT NOT NULL,
  type            TEXT NOT NULL,          -- refund/enroll_deduct
  amount          REAL NOT NULL DEFAULT 0,
  balance_after   REAL NOT NULL DEFAULT 0,
  ref_type        TEXT DEFAULT '',        -- enrollment/transfer
  ref_id          TEXT DEFAULT '',
  operator_id     TEXT DEFAULT '',
  note            TEXT DEFAULT '',
  created_at      TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_acc_tx_student ON account_transactions(student_id, created_at);
CREATE INDEX idx_acc_tx_type ON account_transactions(type, created_at);
```

#### transfers — 退课结转流水

```sql
CREATE TABLE transfers (
  id                    TEXT PRIMARY KEY,
  student_id            TEXT NOT NULL,
  from_enrollment_id    TEXT NOT NULL DEFAULT '',
  to_enrollment_id      TEXT NOT NULL DEFAULT '',
  refund_amount         REAL NOT NULL DEFAULT 0,
  gift_mode             TEXT DEFAULT 'discard', -- discard 赠课作废 / refund 赠课也折算
  operator_id           TEXT DEFAULT '',
  reason                TEXT DEFAULT '',
  note                  TEXT DEFAULT '',
  created_at            TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_transfers_student ON transfers(student_id);
CREATE INDEX idx_transfers_from ON transfers(from_enrollment_id);
CREATE INDEX idx_transfers_to ON transfers(to_enrollment_id);
```

#### admins — 管理员账号

```sql
CREATE TABLE admins (
  id            TEXT PRIMARY KEY,           -- adm_ 开头
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,              -- PBKDF2 格式：iterations:saltHex:hashHex
  role          TEXT NOT NULL DEFAULT 'admin', -- superadmin/admin/teacher
  real_name     TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active', -- active/disabled
  teacher_id    TEXT DEFAULT '',             -- 教师角色关联的 teacherId
  permissions   TEXT DEFAULT '',             -- 自定义权限点（逗号分隔，非空覆盖角色默认）
  last_login_at TEXT DEFAULT '',
  last_login_ip TEXT DEFAULT '',             -- 仅后端记录，不返回前端（PII 保护）
  created_at    TEXT DEFAULT (datetime('now', 'localtime')),
  created_by    TEXT DEFAULT ''
);
```

#### audit_logs — 审计日志

```sql
CREATE TABLE audit_logs (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT NOT NULL,
  actor_name   TEXT NOT NULL,
  actor_role   TEXT NOT NULL,
  action       TEXT NOT NULL,        -- create/update/delete 等
  module       TEXT NOT NULL,        -- students/courses/enrollments 等
  target_type  TEXT DEFAULT '',
  target_id    TEXT DEFAULT '',
  target_name  TEXT DEFAULT '',
  summary      TEXT DEFAULT '',
  before_json  TEXT DEFAULT '',      -- 修改前快照
  after_json   TEXT DEFAULT '',      -- 修改后快照
  ip           TEXT DEFAULT '',
  user_agent   TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at);
CREATE INDEX idx_audit_module ON audit_logs(module, created_at);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
```

> **归档**：`archiveAuditLogs(month)` 按月将记录导出为 `audit-YYYY-MM.json.gz` 文件存于 `data/audit_archive/`，归档后删除原表记录，降低主库体积。前端审计日志页可下载归档文件查看历史。

#### announcement — 公告（单行）

```sql
CREATE TABLE announcement (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  content    TEXT DEFAULT '',      -- Markdown 正文
  updated_at TEXT DEFAULT ''
);
```

#### feedback — 课后反馈

```sql
CREATE TABLE feedback (
  id           TEXT PRIMARY KEY,
  schedule_id  TEXT NOT NULL DEFAULT '',
  course_id    TEXT NOT NULL DEFAULT '',
  teacher_id   TEXT DEFAULT '',
  teacher_name TEXT DEFAULT '',
  student_id   TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  date         TEXT NOT NULL DEFAULT '',
  content      TEXT DEFAULT '',
  rating       INTEGER DEFAULT 0,    -- 0-5 评分
  created_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_feedback_schedule ON feedback(schedule_id);
CREATE INDEX idx_feedback_teacher ON feedback(teacher_id);
CREATE INDEX idx_feedback_student ON feedback(student_id);
CREATE INDEX idx_feedback_course ON feedback(course_id);
CREATE INDEX idx_feedback_teacher_date ON feedback(teacher_id, date); -- 教师绩效聚合
```

#### schedule_changes — 调课记录

```sql
CREATE TABLE schedule_changes (
  id                  TEXT PRIMARY KEY,
  original_schedule_id TEXT NOT NULL,
  new_schedule_id     TEXT NOT NULL DEFAULT '',
  student_id          TEXT NOT NULL,
  student_name        TEXT DEFAULT '',
  course_name         TEXT DEFAULT '',
  before_date         TEXT DEFAULT '',
  before_start_time   TEXT DEFAULT '',
  before_end_time     TEXT DEFAULT '',
  after_date          TEXT DEFAULT '',
  after_start_time    TEXT DEFAULT '',
  after_end_time      TEXT DEFAULT '',
  reason              TEXT DEFAULT '',
  operator_id         TEXT DEFAULT '',
  created_at          TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### 4.3 兼容迁移机制

`core.js` 启动时除建表外，还执行：

- `rebuildStudentsTable`：旧表含 `hours/remaining_hours` 字段，重建删除（移除只读汇总字段）
- `migrateLegacyAdminTable`：旧 admin 表 id 为 INTEGER 自增，迁移到 TEXT id
- `rebuildCoursesTable`：移除已迁移到 classes/enrollments 的字段
- `ensureColumn`：为旧库补齐新增列（status、room、makeup_for、class_id、deducted_* 等）
- `rebuildTransfersTable`：transfers 重建为新结构（退课→账户→报名抵扣关联）

---

## 5. 后端 API 完全指南

### 5.1 统一响应格式

所有 API 返回 JSON：

```typescript
{
  code: number,     // 0=成功，其他=失败
  message: string,  // 提示信息（失败时含原因）
  data: T           // 业务数据（成功时返回，失败时为 null）
}
```

### 5.2 API 分类速览

**公开 API（无需鉴权）**：
- `GET /api/config` — 读取系统配置（appName 等首屏需要的）
- `GET /api/announcement` — 读取公告
- `GET /api/students?q=` — 学员搜索（首页用）
- `GET /api/schedules?studentId=` — 排课查询（首页日历用）
- `GET /api/auth/bootstrap` — 查询引导状态
- `POST /api/auth/bootstrap` — 引导创建超管（仅未初始化时可用）
- `POST /api/auth` — 登录
- `GET /api/parent-access?s=` — 家长端 H5 提示信息
- `POST /api/parent-access` — 家长端手机号后4位校验（限流）

**鉴权 API（需 Bearer token + 权限点）**：
- 学员：students / student-add / student-update / student-delete
- 课程：courses / course-add / course-update / course-delete
- 年级：grades / grade-add / grade-update / grade-delete / grade-promote
- 班级：classes / class-add / class-update / class-delete / class-members
- 排课：schedules / schedules-search / schedule-add / schedule-add-batch / schedule-update / schedule-delete / schedule-makeup / schedule-reschedule / schedule-changes
- 点名：attendance
- 报名：enrollments / enrollment-add / enrollment-update / enrollment-delete
- 结转：transfers / transfer-add
- 账户：account-transactions
- 反馈：feedback
- 教师：teacher-performance
- 账号：admins / admin-add / admin-update / admin-delete / permission-definitions
- 公告：announcement
- 配置：config
- 报表：reports
- 审计：audit-logs / audit-archives
- 备份：backups

### 5.3 处理器典型结构

以 `student-add.js` 为例：

```javascript
import { requirePermission } from '../_lib/auth.js'
import { addStudent } from '../_lib/store.js'
import { writeAudit } from '../_lib/audit.js'

export async function onRequestPost(context) {
  const fail = await requirePermission(context, 'students:create')
  if (fail) return fail
  const { request, admin } = context
  const body = await request.json()
  // 参数校验...
  const student = await addStudent(body)
  await writeAudit(context, {
    action: 'create',
    module: 'students',
    targetType: 'student',
    targetId: student.id,
    targetName: student.name,
    summary: `新增学员 ${student.name}`,
    after: student,
  })
  return Response.json({ code: 0, message: '学员已新增', data: { student } })
}

export default onRequestPost
```

### 5.4 报表 API 详解

`GET /api/reports?type=<type>&startDate=&endDate=&groupBy=`

支持 6 种报表类型（`reports.js`）：

| type | 数据源 | 用途 |
|------|--------|------|
| `revenue` | enrollments（paid_amount > 0） | 营收报表（按 enrolled_at 过滤，可按 day/month/course/teacher 分组） |
| `hours-consumption` | schedules（attended=1） | 课时消耗（按 date 过滤） |
| `hours-balance` | enrollments（status=active） | 课时余额（剩余/总课时） |
| `attendance-rate` | schedules | 出勤率（到课/缺勤/总数与百分比） |
| `transfers` | transfers | 结转统计（金额/笔数） |
| `enrollment-stats` | enrollments | 报名统计（笔数/金额，可按 course/status 分组） |

所有报表返回 `{ rows, summary }`，summary 为整体汇总。

---

## 6. 鉴权与权限系统

### 6.1 三级角色与权限模型

| 角色 | 权限范围 |
|------|---------|
| `superadmin` | 通配 `*`，全部权限 |
| `admin` | 37 个权限点（业务全权，含 students/courses/grades/classes/enrollments/transfers/schedules/attendance/announcement/reports/settings/feedback/teachers 等） |
| `teacher` | 12 个权限点（查看 + 调课/补课 + 点名 + 反馈） |

**自定义权限**：`admins.permissions` 字段存逗号分隔串，非空时**覆盖**角色默认权限。前端账号中心可勾选权限矩阵。

### 6.2 权限点定义（15 个模块）

完整定义见 `auth.js` 的 `PERMISSION_DEFINITIONS`：

| 模块 | 权限点 |
|------|--------|
| 学员管理 | students:view/create/update/delete |
| 课程管理 | courses:view/create/update/delete |
| 年级管理 | grades:view/create/update/delete |
| 班级管理 | classes:view/create/update/delete |
| 报名管理 | enrollments:view/create/update/delete |
| 结转退课 | transfers:view/create |
| 账户管理 | accounts:view |
| 排课管理 | schedules:view/create/update/delete/reschedule |
| 点名管理 | attendance:view/update |
| 教师管理 | teachers:view |
| 课后反馈 | feedback:view/create/update/delete |
| 公告管理 | announcement:view/update |
| 报表中心 | reports:view |
| 系统设置 | settings:manage |
| 账号中心 | admins:view/create/update/delete |
| 审计日志 | audit:view |

### 6.3 Token 签发与校验

**格式**：`base64url(payload_json) + "." + hex(HMAC-SHA256(secret, payload_b64))`

**payload**：`{ uid, username, role, realName, ts }`

**密钥来源**：`config.json` 的 `tokenSecret`（首次启动自动生成 32 字节随机十六进制字符串）

**有效期**：24 小时（`maxAgeMs = 24 * 60 * 60 * 1000`）

**校验流程**：
1. 拆分 token 为 `payloadB64.sig` 两段
2. 用 secret 重新计算 HMAC，与 token 中的 sig **常量时间比较**（防时序攻击）
3. 解析 payload JSON，校验 `ts` 是否在有效期内
4. 防止 `ts` 超前（`> Date.now() + 60_000` 视为伪造）

### 6.4 requirePermission 鉴权链

```
requirePermission(context, permission)
  ↓
requireAuth(context)        # 校验 token 签名 + 注入 context.admin
  ↓
getAdminById(admin.id)      # 查库取最新状态（防止被降级/禁用后旧 token 仍可用）
  ↓
latest 不存在？             → 403 账号不存在
latest.status === 'disabled'？ → 403 账号已被禁用
latest.role === 'superadmin'？ → 用 DB 最新角色覆写 context.admin.role，放行
  ↓
hasPermission(latest, permission)？
  否 → 403 权限不足
  是 → 用 DB 最新角色/权限覆写 context.admin，放行
```

> **关键安全修复**：用 DB 最新角色覆写 `context.admin.role`，防止 admin 被降级为 teacher 后下游路由仍用 token 内的陈旧 'admin' 角色做数据范围过滤导致越权读取。

### 6.5 密码哈希

**算法**：PBKDF2-HMAC-SHA256
**迭代次数**：600000 次（OWASP 2023 推荐）
**盐**：16 字节随机
**派生位数**：256 bit
**存储格式**：`iterations:saltHex:hashHex`
**校验**：常量时间比较（`constantTimeEqual`）

**密码策略**（`validatePasswordPolicy`）：
- 至少 8 位
- 不能超过 128 位
- 必须同时包含字母和数字

### 6.6 限流（rate-limit.js）

基于内存滑动窗口计数器：

| 场景 | 维度 | 限制 |
|------|------|------|
| 登录失败 | `login:${ip}` | 每 IP 每分钟 10 次 |
| 家长端校验 | `parent:${ip}` + `parent-stu:${studentId}` | 每 IP 每分钟 5 次，每学员每分钟 5 次 |

**IP 提取策略**（`getClientIp`）：
1. 优先使用 `context.remoteAddress`（TCP socket 真实远端地址，不可伪造）
2. 缺失时回退到 `X-Forwarded-For` 首段
3. 再回退到 `X-Real-IP`

> **安全修复**：早期版本用 XFF 首段做限流维度，攻击者可伪造 XFF 绕过登录限流。现已改为优先用 TCP 连接的真实远端地址（由 server.js 注入 `req.socket.remoteAddress`）。

### 6.7 家长端 H5 双层鉴权

1. **专属链接**：`?s=学员ID&t=token`（家长从管理员分享链接获得）
2. **手机号后4位校验**：进入页面后输入学员 phone 后4位，校验通过才能查看完整数据

**返回数据脱敏**：家长端只返回学员基本信息（不含 phone 全号）、排课、报名汇总（剩余课时）、反馈、公告。

---

## 7. 前端架构与组件

### 7.1 页面模式路由（App.tsx）

根据 URL 状态决定页面模式：

| URL | 模式 | 组件 |
|-----|------|------|
| `#admin` 或 `#admin/子页面` | admin | `<AdminPanel>` |
| `?s=学员ID` | parent | `<ParentH5>` |
| 其他 | home | `<Home>` |

监听 `popstate` 事件，浏览器前进/后退时重新判定。

### 7.2 后台主框架（AdminPanel.tsx）

侧边栏按使用顺序分 4 个分类：

| 分类 | 包含模块 |
|------|---------|
| **基础教务** | 年级 / 课程 / 班级 / 学员 / 教师 |
| **教学运营** | 报名 / 排课 / 点名 / 结转退课 |
| **报表中心** | 报表中心（6 种报表） |
| **系统管理** | 账号中心 / 系统设置 / 公告 / 分享链接 / 审计日志 |

**模块入口按权限过滤**：`moduleEntries` 数组中每个入口含 `perm` 字段，通过 `canSeeModule(currentAdmin, perm)` 判断是否渲染。细粒度操作权限由后端 `requirePermission` 兜底校验。

### 7.3 前端权限工具（permission.ts）

```typescript
// 角色默认 view 权限（与后端 ROLE_PERMISSIONS 保持一致，仅用于菜单显隐）
export const ROLE_DEFAULT_VIEW_PERMISSIONS = {
  superadmin: [],  // 空 + role === 'superadmin' 判断时返回 null 表示全部拥有
  admin: [/* 14 个 view 权限点 */],
  teacher: [/* 9 个 view 权限点 */],
}

export function resolvePermissions(admin): string[] | null  // null = superadmin 通配
export function hasPermission(admin, permission): boolean
export function canSeeModule(admin, permission): boolean
```

### 7.4 API 调用层（src/api/）

- `index.ts`：公共 API（学员搜索、排课查询、公告、配置、家长端），无鉴权
- `admin.ts`：管理后台 API，统一封装 token 注入与 401 处理

`request<T>` 通用封装：
- GET/HEAD 不发送 Content-Type
- 自动从 localStorage 取 token 注入 Authorization
- 401 抛出 "未登录或登录已过期"
- 不检查 content-type，直接尝试解析 JSON（兼容代理修改 content-type）

### 7.5 UI 组件库

- `src/components/ui/`：自研基础组件（Button / Modal / Field / Pagination / confirm / toast 等）
- `src/components/ui/shadcn/`：基于 shadcn/ui 的组件（sidebar / dialog / table / tooltip / breadcrumb 等）
- 图标统一用 `lucide-react`

### 7.6 日历视图

- **MonthView**：6×7 网格，今日高亮，每格最多 3 条，超出显示「+N 更多」
- **WeekView**：桌面 7 列网格，移动端列表式切换
- **DayView**：按上午 / 下午 / 晚上三时段分组
- 全响应式：手机 / 平板 / 桌面三端自适应

---

## 8. 核心业务流程

### 8.1 报名 → 点名 → 退课 全流程

```
1. 报名（enrollment-add）
   - 学员 × 课程 创建 enrollment：purchased_hours / gift_hours / unit_price / total_amount
   - remaining_paid_hours = purchased_hours，remaining_gift_hours = gift_hours
   - 写审计日志

2. 排课（schedule-add / schedule-add-batch）
   - 按学员 + 课程 + 日期 + 时间段创建排课
   - 批量：日期×学员笛卡尔积

3. 点名（attendance）
   - 按日期加载所有排课
   - 三态：到课 / 缺勤 / 未点名
   - 到课：定位该学员该课程最早一条 active enrollment
     - 先扣 remaining_paid_hours，扣完再扣 remaining_gift_hours
     - 记录 deducted_enrollment_id + deducted_type（精准回退用）
   - 缺勤：根据 deducted_enrollment_id + deducted_type 精准回退（先回退赠课）
   - 仅当新旧 attended 值不同时才扣减/回退

4. 退课结转（transfer-add）
   - 校验源 enrollment 为 active 且有剩余课时
   - giftMode='discard'：仅付费课时折算（赠课作废）
   - giftMode='refund'：付费+赠课都折算
   - refundAmount = refundHours × unitPrice
   - 源 enrollment 清零并标记 settled
   - 取消该学员该课程未来未点名排课（date >= 今天 且 attended IS NULL）
     同时取消补课生成的排课（makeup_for 指向该课程的原排课）
   - 金额进学员账户余额（adjustBalanceTx 写 account_transactions + 更新 students.balance）
   - 写 transfers 记录

5. 续费报名
   - 同一课程可再次 enrollment-add，新增一条 active enrollment
   - 点名时按 enrolled_at 排序定位最早一条 active 报名扣减
```

### 8.2 调课与补课

**调课（schedule-reschedule）**：
- 创建新排课（`rescheduled_from` 指向原排课）
- 原排课标记 cancelled
- 写 schedule_changes 记录（before/after 日期时间）

**补课（schedule-makeup）**：
- 创建新排课（`makeup_for` 指向原缺勤排课，`status='makeup'`）
- 原缺勤排课保持不变
- 补课排课点名扣减走正常流程
- 前端通过 `hasMakeup` 字段判断是否已添加补课，控制补课按钮显隐

### 8.3 删除学员（保留历史）

`deleteStudentWithSchedules` 事务内：

| 表 | 操作 | 原因 |
|----|------|------|
| schedules（未点名） | 删除 | 避免孤儿排课 |
| schedules（已点名） | **保留** | 报表统计需要 |
| enrollments | **保留** | 营收/报名统计需要 |
| transfers | **保留** | 结转记录需要 |
| account_transactions | **保留** | 账户流水需要 |
| feedback | 删除 | 避免孤儿反馈 |
| class_members | 删除 | 避免班级残留成员 |
| schedule_changes | 删除 | 避免孤儿调课记录 |
| students | 删除 | 主表删除 |

> 前端先检查是否有剩余课时（`listEnrollments?status=active`），有则禁止删除并提示走退课流程。

### 8.4 报名过期

`expireOverdueEnrollments`（cron 调用）：
- 查询 `expired_at <= 今天` 且 `status = 'active'` 的报名
- 更新 `status = 'expired'`
- 不取消排课（仅状态变更）

### 8.5 审计日志归档

`archiveAuditLogs(month)`：
1. 查询指定月份所有审计日志
2. 序列化为 JSON，gzip 压缩写文件 `audit-YYYY-MM.json.gz`
3. 删除原表该月记录
4. 全程事务，失败回滚

前端审计日志页可查看当月未归档记录，下载归档文件查看历史月份。

### 8.6 数据备份与恢复

**备份**（`createBackup`）：
- 用 SQLite `VACUUM INTO` 生成独立 db 副本（不阻塞读写）
- 文件名 `backup-YYYYMMDD-HHMMSS.db`
- 存于 `data/backups/`
- 自动清理超过 `backupKeepDays` 或超过 `backupMaxCount` 的旧备份

**恢复**（`restoreBackup`）：
- 设置 `isRestoring = true` 标志
- 期间所有写操作返回 503（server.js 拦截）
- 用备份文件覆盖当前 db
- 完成后清除标志

**自动备份**：cron 调度，默认每天 3:00（`backupCron = '0 3 * * *'`），按 TZ 环境变量计算执行时刻。

---

## 9. 部署与运维

### 9.1 Docker 镜像构建

**多阶段构建**（Dockerfile）：

```
阶段1 builder（node:20-alpine）:
  - apk add python3 make g++（编译 better-sqlite3 native 模块）
  - npm ci（含 devDependencies）
  - npm run build（构建前端到 dist/）
  - npm prune --omit=dev（剪枝 devDependencies）
  - 清理 better-sqlite3 编译中间产物

阶段2 runtime（node:20-alpine）:
  - COPY package.json
  - COPY --from=builder node_modules
  - COPY server.js + node-functions/
  - COPY --from=builder dist/
  - mkdir /app/data && chown node:node /app
  - VOLUME /app/data
  - USER node（非 root 运行）
  - 安装 tzdata + 设置 TZ=Asia/Shanghai
  - HEALTHCHECK（wget /api/auth/bootstrap）
  - CMD ["node", "server.js"]
```

### 9.2 GitHub Actions CI/CD

`.github/workflows/docker-publish.yml`：

- **触发条件**：
  - push tag `v*.*.*`（semver）→ 镜像 tag 用版本号
  - push 到 main 分支 → 镜像 tag 用 commit sha 短标签
- **多架构**：amd64 + arm64（用 `docker/build-push-action` 的 `linux/amd64,linux/arm64`）
- **推送目标**：GHCR（`ghcr.io/mxlitey/pai-docker`）
- **缓存**：用 `type=gha` GitHub Actions 缓存加速构建

### 9.3 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | 否 | `8788` | 服务监听端口 |
| `DATA_DIR` | 否 | `/app/data` | 数据目录（含 pai.db + config.json + backups + audit_archive） |
| `TZ` | 否 | `Asia/Shanghai` | 时区（影响 cron 执行时刻与日期格式化） |
| `NODE_ENV` | 否 | `production` | Node 环境 |

> **零业务配置**：超管密码通过首次访问引导页设置；token 密钥由系统首次启动自动生成 32 字节随机值并持久化到 config.json；项目名称等系统配置在后台「系统设置」页面动态修改。

### 9.4 部署方式

**docker-compose（推荐）**：

```yaml
services:
  pai:
    image: ghcr.io/mxlitey/pai-docker:latest
    container_name: pai
    restart: unless-stopped
    ports:
      - "8788:8788"
    volumes:
      - pai-data:/app/data
    environment:
      PORT: "8788"
      TZ: "Asia/Shanghai"

volumes:
  pai-data:
```

**docker run**：

```bash
docker run -d \
  --name pai \
  -p 8788:8788 \
  -v pai-data:/app/data \
  --restart unless-stopped \
  ghcr.io/mxlitey/pai-docker:latest
```

### 9.5 首次部署：超管账号引导创建

1. 启动容器后访问 `http://<服务器IP>:8788`
2. 系统检测到 admins 表为空，自动跳转到引导页
3. 设置超管用户名（默认 admin）+ 密码（至少 8 位，字母数字混合）+ 确认
4. 创建成功后跳转到登录页，使用刚设置的账号登录

> 引导接口 `POST /api/auth/bootstrap` 仅在系统未初始化时可用，创建成功后自动关闭。

### 9.6 数据备份与恢复

- **自动备份**：cron 调度（默认每天 3:00），保留 30 天 / 500 份
- **手动备份**：后台「系统设置」→ 备份管理 → 创建备份
- **恢复**：上传备份文件或选择已有备份 → 恢复期间阻塞写操作（503）
- **整目录备份**：复制整个 `/app/data` 目录（含 pai.db + config.json + backups + audit_archive）

> 丢失 `config.json` 会导致 tokenSecret 重置，所有已签发 token 失效。

### 9.7 安全响应头

server.js 在所有响应中注入：

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'
```

### 9.8 请求体大小限制

`MAX_BODY = 2 * 1024 * 1024`（2MB），超过返回 413。防止超大 JSON body 拖垮内存（DoS 防护）。

---

## 10. 开发指南

### 10.1 本地开发

```bash
# 安装依赖
npm ci

# 启动后端（默认 8788 端口，watch 模式）
node server.js

# 另一个终端：启动前端 dev server（Vite，默认 5173）
npm run dev
```

> 生产环境前后端同源由 server.js 托管 dist/；开发环境前端走 Vite dev server，需配置代理转发 `/api` 到 8788。

### 10.2 新增 API 流程

1. 在 `node-functions/api/` 下新建文件，如 `my-feature.js`
2. 实现处理函数（导出 default 或 onRequestGet/Post/Put/Delete）
3. 用 `requirePermission(context, 'my-feature:view')` 鉴权
4. 调用 store 层读写数据
5. 用 `writeAudit(context, {...})` 记录审计
6. 返回 `Response.json({ code: 0, message, data })`

文件名自动映射为路由，无需注册。

### 10.3 新增前端模块

1. 在 `src/components/Admin/` 下新建组件 `MyFeatureAdmin.tsx`
2. 在 `AdminPanel.tsx` 的 `SubPage` 类型加 `'myFeature'`
3. 在 `moduleEntries` 数组加入口（含 tab/perm/sub/title/desc/icon）
4. 在 `iconMap` 加图标
5. 在 `readSubPageFromHash` 的 valid 数组加 `'myFeature'`
6. 在 `renderSubPage` 加渲染分支
7. 在 `src/api/admin.ts` 加对应 API 调用

### 10.4 新增数据库表

1. 在 `core.js` 的 `db.exec()` 中加 `CREATE TABLE IF NOT EXISTS ...`
2. 加必要的索引
3. 在 `node-functions/_lib/store/` 下新建对应模块（如 `my-table.js`）
4. 在 `store.js` re-export
5. 在 `src/types/index.ts` 加 TypeScript 类型
6. 如需兼容旧库，在 `core.js` 加 `ensureColumn` 或 rebuild 逻辑

### 10.5 测试

`scripts/test_suite.py` 是端到端测试套件（Python requests），覆盖：

- 引导创建超管
- 登录 / 鉴权 / 权限校验
- 学员 / 课程 / 年级 / 班级 CRUD
- 报名 / 退课 / 账户余额
- 排课 / 点名（赠课后扣规则）
- 调课 / 补课
- 审计日志 / 报表
- 备份恢复
- 限流 / 密码策略

运行：

```bash
# 先启动服务
node server.js &

# 运行测试
python3 scripts/test_suite.py
```

### 10.6 构建与发布

```bash
# 构建前端
npm run build

# 本地构建 Docker 镜像
docker build -t pai:latest .

# 发布（打 tag 触发 GitHub Actions）
git tag v1.0.0
git push origin v1.0.0
```

---

## 11. API 速查表

### 公开 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 读取系统配置 |
| GET | `/api/announcement` | 读取公告 |
| GET | `/api/students?q=` | 学员搜索（精确+模糊） |
| GET | `/api/schedules?studentId=&startDate=&endDate=` | 按学员查排课 |
| GET | `/api/schedules?studentName=&startDate=&endDate=` | 按姓名查排课 |
| GET | `/api/auth/bootstrap` | 查询引导状态 |
| POST | `/api/auth/bootstrap` | 引导创建超管（仅未初始化） |
| POST | `/api/auth` | 登录 |
| GET | `/api/parent-access?s=` | 家长端提示信息 |
| POST | `/api/parent-access` | 家长端手机号后4位校验（限流） |

### 鉴权 API

| 方法 | 路径 | 权限点 | 说明 |
|------|------|--------|------|
| GET | `/api/auth` | 已登录 | 校验 token |
| GET | `/api/students` | — | 后台学员列表（已登录） |
| POST | `/api/student-add` | students:create | 新增学员 |
| PUT | `/api/student-update` | students:update | 更新学员（姓名变更级联更新排课） |
| DELETE | `/api/student-delete` | students:delete | 删除学员（保留历史数据） |
| GET | `/api/courses` | courses:view | 课程列表 |
| POST | `/api/course-add` | courses:create | 新增课程 |
| PUT | `/api/course-update` | courses:update | 更新课程 |
| DELETE | `/api/course-delete` | courses:delete | 删除课程及关联排课 |
| GET | `/api/grades` | grades:view | 年级列表 |
| POST | `/api/grade-add` | grades:create | 新增年级 |
| PUT | `/api/grade-update` | grades:update | 更新年级 |
| DELETE | `/api/grade-delete` | grades:delete | 删除年级 |
| POST | `/api/grade-promote` | grades:update | 批量升班 |
| GET | `/api/classes` | classes:view | 班级列表 |
| POST | `/api/class-add` | classes:create | 新增班级 |
| PUT | `/api/class-update` | classes:update | 更新班级 |
| DELETE | `/api/class-delete` | classes:delete | 删除班级 |
| GET | `/api/class-members?classId=` | classes:view | 班级成员 |
| POST | `/api/class-members` | classes:update | 添加/移除成员 |
| GET | `/api/schedules-search` | schedules:view | 跨学员搜索排课 |
| POST | `/api/schedule-add` | schedules:create | 新增单条排课 |
| POST | `/api/schedule-add-batch` | schedules:create | 批量新增排课 |
| PUT | `/api/schedule-update` | schedules:update | 修改排课 |
| DELETE | `/api/schedule-delete` | schedules:delete | 删除排课 |
| POST | `/api/schedule-makeup` | schedules:reschedule | 添加补课 |
| POST | `/api/schedule-reschedule` | schedules:reschedule | 调课 |
| GET | `/api/schedule-changes` | schedules:view | 调课记录 |
| GET | `/api/attendance?date=` | attendance:view | 指定日期排课（含出勤） |
| POST | `/api/attendance` | attendance:update | 批量点名（赠课后扣） |
| GET | `/api/enrollments` | enrollments:view | 报名列表（可按 studentId/courseId/status 过滤） |
| POST | `/api/enrollment-add` | enrollments:create | 新增报名 |
| PUT | `/api/enrollment-update` | enrollments:update | 更新报名（课时已使用不可编辑） |
| DELETE | `/api/enrollment-delete` | enrollments:delete | 删除报名 |
| GET | `/api/transfers` | transfers:view | 结转流水 |
| POST | `/api/transfer-add` | transfers:create | 退课结转 |
| GET | `/api/account-transactions?studentId=` | accounts:view | 账户流水 |
| GET | `/api/feedback` | feedback:view | 课后反馈 |
| POST | `/api/feedback` | feedback:create | 新增反馈 |
| PUT | `/api/feedback` | feedback:update | 更新反馈 |
| DELETE | `/api/feedback` | feedback:delete | 删除反馈 |
| GET | `/api/teacher-performance` | teachers:view | 教师绩效 |
| GET | `/api/admins` | admins:view | 账号列表 |
| POST | `/api/admin-add` | admins:create | 新增账号 |
| PUT | `/api/admin-update` | admins:update | 更新账号（含权限分配） |
| DELETE | `/api/admin-delete` | admins:delete | 删除账号 |
| GET | `/api/permission-definitions` | admins:view | 权限定义（前端权限矩阵） |
| GET | `/api/announcement` | announcement:view | 读取公告 |
| POST | `/api/announcement` | announcement:update | 保存公告 |
| GET | `/api/config` | — | 读取配置 |
| PUT | `/api/config` | settings:manage | 修改配置 |
| GET | `/api/reports?type=&startDate=&endDate=&groupBy=` | reports:view | 报表查询 |
| GET | `/api/audit-logs` | audit:view | 审计日志查询 |
| GET | `/api/audit-archives` | audit:view | 审计归档列表 |
| GET | `/api/audit-archives?month=` | audit:view | 下载归档文件 |
| POST | `/api/audit-archives` | audit:view | 触发归档（按月） |
| GET | `/api/backups` | settings:manage | 备份列表 |
| POST | `/api/backups` | settings:manage | 创建备份 |
| POST | `/api/backups/restore` | settings:manage | 恢复备份（阻塞写） |
| DELETE | `/api/backups` | settings:manage | 删除备份 |
| POST | `/api/expire` | — | 报名过期检查（cron 内部调用） |

---

## 12. FAQ 与常见问题

### Q1: 忘记超管密码怎么办？

停止容器，删除 admins 表中 admin 账号的记录后重启，会重新进入引导流程：

```bash
docker exec -it pai sh -c "sqlite3 /app/data/pai.db \"DELETE FROM admins WHERE username='admin';\""
docker restart pai
```

> 仅清除管理员账号，业务数据与系统配置不受影响。

### Q2: token 失效了怎么办？

token 由 config.json 中的 tokenSecret 签名。如果 tokenSecret 丢失或重置（如 config.json 损坏），所有已签发 token 失效，用户需重新登录。

### Q3: 如何升级版本？

```bash
docker compose pull
docker compose up -d
```

数据库 schema 由 core.js 启动时自动迁移（建表 + ensureColumn + rebuild），无需手动操作。

### Q4: SQLite 单文件能扛多少并发？

WAL 模式下读不阻塞写，单机并发读写完全够用。better-sqlite3 同步 API 避免回调开销。教培机构数据量通常在万级以下，性能不是瓶颈。如需横向扩展，可迁移 store 层到 PostgreSQL。

### Q5: 如何修改时区？

通过 `TZ` 环境变量：

```yaml
environment:
  TZ: "America/Los_Angeles"
```

> 注意：cron 调度时刻按 TZ 计算，已有数据的 `created_at` 字段保持原值不变。

### Q6: 审计日志会无限增长吗？

不会。`archiveAuditLogs(month)` 按月将日志导出为 `audit-YYYY-MM.json.gz` 存于 `data/audit_archive/`，归档后删除原表记录。可在后台「审计日志」页手动触发归档，或通过 cron 定期归档。

### Q7: 如何自定义权限？

在后台「账号中心」编辑账号，勾选权限矩阵。`admins.permissions` 字段存逗号分隔串，非空时覆盖角色默认权限。

### Q8: 家长端链接失效了怎么办？

后台「分享链接」页重新生成专属链接，发给家长。链接中的 token 不变，只是 URL 重新组装。

### Q9: 删除学员后报表数据会失真吗？

不会。`deleteStudentWithSchedules` 保留 `enrollments`、`transfers`、`account_transactions`、已点名排课，仅删除未点名排课、班级成员关系、反馈、调课记录。报表查询这些表时数据仍然完整。

### Q10: 点名扣错课时怎么办？

点名记录了 `deducted_enrollment_id` + `deduted_type`，改缺勤时精准回退。如果发现扣错，将学员改为缺勤再改回未点名即可重置。极端情况下可直接修改数据库（但会绕过审计，不推荐）。

---

## 附录：技术决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 数据库 | SQLite + WAL | 单文件部署、零运维、教培数据量级够用 |
| 后端框架 | 原生 HTTP Server | 极简、无框架依赖、Edge Functions 风格 |
| 路由 | 按文件名自动映射 | 新增 API 零配置 |
| 密码哈希 | PBKDF2-HMAC-SHA256 600000 次 | OWASP 2023 推荐 |
| Token | HMAC-SHA256 自实现 | 无 JWT 依赖，可控 payload |
| 前端框架 | React 18 + TypeScript | 类型安全、生态成熟 |
| UI 库 | Tailwind + shadcn/ui | 原子化 + 可定制组件 |
| 部署 | Docker 多阶段 + 非 root | 安全、镜像小、可重复 |
| CI/CD | GitHub Actions 多架构 | amd64/arm64 覆盖主流平台 |
| 限流 | 内存滑动窗口 | 单机够用，无需 Redis |
| 审计归档 | 按月 gzip 文件 | 降低主库体积，历史可追溯 |
| 备份 | VACUUM INTO | 不阻塞读写，独立副本 |

---

*本文档基于代码实际状态编写，最后更新：2026-07-12*
