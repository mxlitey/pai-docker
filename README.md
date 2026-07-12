<div align="center">
  <h1>📅 排课系统</h1>
  <p>面向教培机构的排课、教务、计费一体化管理系统</p>
  <p>Docker 自托管 · SQLite 单文件持久化 · RBAC 细粒度权限 · 零配置启动</p>
</div>

***

## 📖 项目介绍

排课系统是一套面向教育培训机构（琴行、画室、辅导班、体育培训等）的**排课、教务与计费一体化管理系统**。前端为 React + TypeScript 单页应用，后端运行于 Node.js（原生 HTTP Server），数据存储使用 SQLite（单文件持久化 + WAL 模式），适合私有服务器、内网或单机场景，无需外部数据库。

系统覆盖教培机构全业务流程：**基础教务**（学员档案、年级、班级、课程、教师）→ **教学运营**（报名购课、排课、点名、退课结转）→ **财务核算**（账户余额、续费预警）→ **数据洞察**（6 种报表、教师绩效）→ **多方协作**（管理员后台 RBAC、家长端 H5 专属链接、教师课后反馈）。

系统采用**零配置启动**：超管账号首次访问时引导创建，token 签名密钥首次启动自动生成 32 字节随机值，项目名称、续费阈值、备份策略等配置通过后台「系统设置」页面动态修改，无需任何环境变量。

***

## ✨ 功能特性

### 首页
- 🏠 **类百度简洁首页**：项目名称居中 + 学员搜索框 + 查看排课入口
- 🔍 **智能搜索**：精确 + 模糊双模式匹配，防抖 250ms，键盘 ↑↓ Enter Esc 导航
- 📢 **公告展示**：Markdown 渲染（react-markdown + remark-gfm），内容为空时自动隐藏

### 日历视图
- 📅 **三视图切换**：月 / 周 / 日，按当前视图粒度导航
- 🗓️ **月视图**：6×7 网格，今日高亮，每格最多 3 条，超出显示「+N 更多」
- 📊 **周视图**：桌面 7 列网格，移动端列表式切换
- 🌅 **日视图**：按上午 / 下午 / 晚上三时段分组
- 📱 **全响应式**：手机 / 平板 / 桌面三端自适应

### 排课查询与详情
- 🔎 **多方式查询**：按学员 ID、姓名 + 可选日期范围
- 📋 **详情弹窗**：课程、教师、地点、日期、时间、学员、出勤状态完整展示
- 🔗 **分享链接**：为每位学员生成专属查看链接，家长访问直达日历页

### 基础教务
- 👥 **学员管理**：分页表格、新增 / 编辑 / 删除（二次确认 + 课时检查）、姓名变更级联更新排课、报名汇总展示、续费预警
- 🎓 **年级管理**：主数据维护、批量升班（学员与课程 grade 同步升级）、关联课程
- 🗂️ **班级管理**：班级建档、关联课程、固定学员名单、容量限制
- 📚 **课程管理**：10 色颜色标签、计费方式（按课时/按月/按学期）、关联年级、删除同时清理关联排课
- 🧑‍🏫 **教师管理**：课后反馈汇总、教师绩效（出勤率、评分）、关联账号

### 教学运营
- 📝 **报名管理**：报名购课 + 赠课、课时余额、续费预警、课时已使用不可编辑
- 🗓️ **排课管理**：双 tab（按学员 / 按日期+课程筛选）、单条新增、批量新增（日期×学员笛卡尔积）、按班级排课
- ✅ **点名管理**：按日期加载，课程→时间段两级分组，三态出勤，时间段级与全局批量操作、赠课后扣规则
- 🔄 **调课 / 补课**：调课保留原记录、补课关联原排课、补课按钮已添加后自动隐藏
- 💸 **结转退课**：源报名清零→折算金额入账户余额→取消未来排课；赠课模式可选（作废 / 折算）

### 报表中心
- 📊 **6 种报表**：
  - 营收报表（按 day/month/course/teacher 分组）
  - 课时消耗报表
  - 课时余额报表
  - 出勤率报表
  - 结转统计报表
  - 报名统计报表
- 📈 **教师绩效**：出勤率、平均评分、反馈数

### 家长端 H5
- 📱 **专属链接访问**：`?s=学员ID&t=token` 进入
- 🔐 **双层鉴权**：专属链接 + 手机号后4位校验
- 📋 **数据展示**：学员基本信息、排课日历、报名汇总（剩余课时）、教师反馈、公告
- 🚫 **数据脱敏**：不返回 phone 全号等敏感信息

### 后台管理（RBAC）
- 🛡️ **三级角色**：superadmin（全部权限）/ admin（业务全权）/ teacher（受限）
- 🔑 **42 个权限点**：15 个模块，每个模块含 view/create/update/delete 等操作
- ⚙️ **自定义权限**：账号可勾选权限矩阵，覆盖角色默认权限
- 📋 **按权限过滤菜单**：侧边栏模块入口按当前用户权限显隐

### 系统管理
- 👤 **账号中心**：账号增删、权限分配、启停、关联教师
- ⚙️ **系统设置**：项目名称、续费预警阈值、备份策略（保留天数/cron/最大份数）、模块开关
- 📢 **公告管理**：编辑 / 预览双 tab，Markdown 实时渲染，字数统计
- 🔗 **分享链接**：一键生成全部学员查看链接，单条 / 全量复制
- 📝 **审计日志**：写操作留痕，按模块/人/时间筛选，按月 gzip 归档
- 💾 **备份恢复**：VACUUM INTO 生成独立 db 副本，恢复期间阻塞写操作

### 安全与性能
- 🔐 **鉴权**：HMAC-SHA256 签名 token，与登录密码解耦，24 小时有效
- 🛡️ **并发安全**：SQLite WAL 模式 + ACID 事务，读不阻塞写
- 🚫 **防注入**：存储 id 校验 `/^[A-Za-z0-9_-]{1,64}$/`，参数化查询
- 🔑 **密码哈希**：PBKDF2-HMAC-SHA256（600000 次迭代，OWASP 2023 推荐）加盐存储
- 🔒 **密码策略**：至少 8 位，须同时包含字母和数字
- 🛡️ **安全响应头**：CSP / X-Frame-Options: DENY / nosniff / Referrer-Policy
- 📏 **请求体限制**：2MB 上限，防止 DoS
- 🚦 **限流防爆破**：登录每 IP 每分钟 10 次，家长端校验每 IP/学员每分钟 5 次
- 🌐 **IP 提取**：优先用 TCP socket 远端地址（不可伪造），防 XFF 伪造绕过限流
- 🔁 **越权防护**：requirePermission 每次查库取最新角色/权限，用 DB 最新角色覆写 context.admin.role，防降级后旧 token 越权
- 🐳 **非 root 运行**：Docker 容器以 node 用户运行，降低容器逃逸影响面
- ⚡ **索引优化**：排课表按 student_id + date 建复合索引，按月查询高效
- 💾 **高频配置走文件**：项目名称、token 密钥存于 config.json + 内存缓存，读零 IO

***

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 | 函数组件 + Hooks |
| 类型系统 | TypeScript 5 | strict 模式，类型安全 |
| 构建工具 | Vite 5 | 极速构建，ESM 原生支持 |
| 样式方案 | TailwindCSS 3 | 原子化 CSS，自定义 brand 色板与组件类 |
| UI 组件 | shadcn/ui + 自研组件 | sidebar / dialog / table / tooltip 等 |
| 图标 | lucide-react | 现代化图标库 |
| 日期处理 | date-fns 3 | 函数式日期库，中文本地化 |
| Markdown | react-markdown + remark-gfm | 公告渲染，GFM 语法 |
| 后端运行时 | Node.js 20 | 原生 HTTP 服务器，无 Express/Koa |
| 数据存储 | SQLite（better-sqlite3 11） | 单文件持久化，WAL 模式，同步 API |
| 鉴权 | Web Crypto API | HMAC-SHA256 token + PBKDF2 密码哈希 |
| 部署方式 | Docker | 多阶段构建，非 root 用户运行，Volume 挂载持久化 |
| CI/CD | GitHub Actions | 多架构（amd64/arm64）构建推送 GHCR |

***

## 🚀 部署流程

### 前置条件

1. 已安装 Docker（20.10+）与 Docker Compose（可选）
2. 服务器开放对外端口（默认 8788）

> 本项目**零配置启动**：无需任何环境变量，token 密钥、项目名称等配置全部由系统自动生成或通过后台管理界面设置。

### 首次部署：超管账号引导创建

系统取消了固定密码，改为**首次访问时引导创建超管账号**。流程：

1. 启动容器后访问 `http://<服务器IP>:8788`
2. 系统检测到 admins 表为空，自动跳转到引导页
3. 设置超管用户名（默认 admin）+ 密码（至少 8 位，须含字母和数字）并确认
4. 创建成功后跳转到登录页，使用刚设置的账号登录

> 引导接口 `POST /api/auth/bootstrap` 仅在系统未初始化时可用，创建成功后自动关闭。
>
> 超管密码使用 PBKDF2-HMAC-SHA256（600000 次迭代）加盐哈希存储于 SQLite，不存明文。

### 方式一：docker run

```bash
docker run -d \
  --name pai \
  -p 8788:8788 \
  -v pai-data:/app/data \
  --restart unless-stopped \
  ghcr.io/mxlitey/pai-docker:latest
```

### 方式二：docker-compose（推荐）

新建 `docker-compose.yml`：

```yaml
services:
  pai:
    image: ghcr.io/mxlitey/pai-docker:latest
    # 如需本地构建，注释 image 行、取消注释 build 行
    # build: .
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

启动：

```bash
docker compose up -d
```

查看日志（确认是否需要引导初始化）：

```bash
docker compose logs -f pai
```

### 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | 否 | `8788` | 服务监听端口 |
| `DATA_DIR` | 否 | `/app/data` | 数据目录（含 pai.db + config.json + backups + audit_archive） |
| `TZ` | 否 | `Asia/Shanghai` | 时区（影响 cron 执行时刻与日期格式化） |

> ⚠️ 本项目**无需任何业务配置环境变量**：
> - 超管密码通过首次访问引导页设置
> - Token 签名密钥由系统首次启动自动生成 32 字节随机值并持久化到 config.json
> - 项目名称、续费阈值、备份策略等系统配置在后台「系统设置」页面动态修改
>
> 数据库文件位于容器内 `/app/data/pai.db`，系统配置文件位于 `/app/data/config.json`（含 token 签名密钥等敏感信息）。请务必通过 Volume 挂载 `/app/data` 目录持久化，否则容器重建会丢失数据且需要重新初始化。

### 本地构建镜像

```bash
git clone https://github.com/mxlitey/pai-docker.git
cd pai-docker
docker build -t pai:latest .
docker run -d -p 8788:8788 -v pai-data:/app/data pai:latest
```

### 验证部署

1. 查看启动日志，若提示「系统尚未初始化」属正常现象
2. 访问 `http://<服务器IP>:8788`，按引导页创建超管账号
3. 使用刚设置的账号登录后台，验证管理功能
4. 进入后台「系统设置」修改项目名称，确认首页标题随之更新
5. 首页搜索框输入学员姓名，验证排课查询
6. 反向代理（可选）：使用 Nginx / Caddy 转发至 `127.0.0.1:8788` 并配置 HTTPS

### 数据备份与恢复

- **自动备份**：cron 调度（默认每天 3:00），保留 30 天 / 500 份，可在「系统设置」修改策略
- **手动备份**：后台「系统设置」→ 备份管理 → 创建备份（VACUUM INTO 生成独立 db 副本）
- **恢复**：上传备份文件或选择已有备份 → 恢复期间阻塞写操作（返回 503）
- **整目录备份**：复制整个 `/app/data` 目录（含 `pai.db` 业务数据 + `config.json` 系统配置 + `backups/` 备份文件 + `audit_archive/` 审计归档），缺一不可——丢失 `config.json` 会导致 tokenSecret 重置，所有已签发 token 失效
- **重置超管密码**：停止容器，删除 admins 表中 admin 账号记录后重启，会重新进入引导流程（**仅清除管理员账号，业务数据与系统配置不受影响**）

```bash
docker exec -it pai sh -c "sqlite3 /app/data/pai.db \"DELETE FROM admins WHERE username='admin';\""
docker restart pai
```

### 版本升级

```bash
docker compose pull
docker compose up -d
```

数据库 schema 由 `core.js` 启动时自动迁移（建表 + ensureColumn + rebuild），无需手动操作。

***

## 📡 API 一览

系统共 51 个 API 路由，按文件名自动映射。统一响应格式 `{ code, message, data }`，code=0 表示成功。

### 公开 API（无需鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 读取系统配置（appName 等前端首屏需要的配置） |
| GET | `/api/announcement` | 读取公告内容（`{content, updatedAt}`） |
| GET | `/api/students?q=` | 学员列表；带 `?q=` 时按精确+模糊搜索 |
| GET | `/api/schedules?studentId=&startDate=&endDate=` | 按学员 ID 查排课 |
| GET | `/api/schedules?studentName=&startDate=&endDate=` | 按学员姓名查排课 |
| GET | `/api/auth/bootstrap` | 查询引导状态（前端决定是否展示引导页） |
| POST | `/api/auth/bootstrap` | 引导创建超管账号（仅在系统未初始化时可用） |
| POST | `/api/auth` | 登录，返回 token |
| GET | `/api/parent-access?s=` | 家长端 H5 提示信息（脱敏） |
| POST | `/api/parent-access` | 家长端手机号后4位校验（限流） |

### 鉴权 API（需 Bearer token + 权限点）

| 方法 | 路径 | 权限点 | 说明 |
|------|------|--------|------|
| GET | `/api/auth` | 已登录 | 校验 token 有效性 |
| POST | `/api/student-add` | students:create | 新增学员 |
| PUT | `/api/student-update` | students:update | 更新学员（姓名变更级联更新排课） |
| DELETE | `/api/student-delete` | students:delete | 删除学员（保留已点名排课与报名记录） |
| GET | `/api/courses` | courses:view | 获取全部课程 |
| POST | `/api/course-add` | courses:create | 新增课程 |
| PUT | `/api/course-update` | courses:update | 更新课程 |
| DELETE | `/api/course-delete` | courses:delete | 删除课程及所有关联排课 |
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
| POST | `/api/class-members` | classes:update | 添加/移除班级成员 |
| GET | `/api/schedules-search` | schedules:view | 跨学员搜索排课 |
| POST | `/api/schedule-add` | schedules:create | 新增单条排课 |
| POST | `/api/schedule-add-batch` | schedules:create | 批量新增排课（日期×学员笛卡尔积） |
| PUT | `/api/schedule-update` | schedules:update | 修改排课 |
| DELETE | `/api/schedule-delete` | schedules:delete | 删除排课 |
| POST | `/api/schedule-makeup` | schedules:reschedule | 添加补课 |
| POST | `/api/schedule-reschedule` | schedules:reschedule | 调课 |
| GET | `/api/schedule-changes` | schedules:view | 调课记录 |
| GET | `/api/attendance?date=` | attendance:view | 获取指定日期所有排课（含出勤状态） |
| POST | `/api/attendance` | attendance:update | 批量点名（赠课后扣规则） |
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
| GET | `/api/permission-definitions` | admins:view | 权限定义（前端权限矩阵用） |
| POST | `/api/announcement` | announcement:update | 保存公告（最大 5000 字） |
| PUT | `/api/config` | settings:manage | 修改系统配置 |
| GET | `/api/reports?type=&startDate=&endDate=&groupBy=` | reports:view | 报表查询（6 种类型） |
| GET | `/api/audit-logs` | audit:view | 审计日志查询 |
| GET | `/api/audit-archives` | audit:view | 审计归档列表 |
| GET | `/api/audit-archives?month=` | audit:view | 下载归档文件 |
| POST | `/api/audit-archives` | audit:view | 触发归档（按月） |
| GET | `/api/backups` | settings:manage | 备份列表 |
| POST | `/api/backups` | settings:manage | 创建备份 |
| POST | `/api/backups/restore` | settings:manage | 恢复备份（阻塞写操作） |
| DELETE | `/api/backups` | settings:manage | 删除备份 |

***

## 🗂️ 数据结构

系统涉及 14 张数据库表，TypeScript 类型定义见 [`src/types/index.ts`](src/types/index.ts)。

### 表清单总览

| 表名 | 用途 | ID 前缀 |
|------|------|---------|
| `students` | 学员档案（含账户余额 balance） | `stu_` |
| `courses` | 课程定义（含 billing_type 计费方式） | `crs_` |
| `grades` | 年级（主数据，可批量升班） | `grd_` |
| `classes` | 班级（关联课程 + 固定学员名单） | `cls_` |
| `class_members` | 班级成员（多对多） | — |
| `schedules` | 排课记录（含补课/调课/扣减关联） | `sch_` |
| `enrollments` | 报名记录（计费核心） | `enr_` |
| `account_transactions` | 账户余额流水 | `atx_` |
| `transfers` | 退课结转流水 | `trf_` |
| `admins` | 管理员账号（含 RBAC） | `adm_` |
| `audit_logs` | 审计日志（按月归档） | `aud_` |
| `announcement` | 公告（单行，id=1） | — |
| `feedback` | 课后反馈 | `fdb_` |
| `schedule_changes` | 调课记录 | `chg_` |

### Student（学员）

存储位置：SQLite `students` 表。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识，`/^[A-Za-z0-9_-]{1,64}$/`，`stu_` 前缀 |
| `name` | string | 是 | 姓名，1-32 字符 |
| `grade` | string | 否 | 年级文本（引用 grades.name） |
| `phone` | string | 否 | 家长手机号（家长端鉴权用） |
| `parentName` | string | 否 | 家长姓名 |
| `gender` | string | 否 | 性别 |
| `birthday` | string | 否 | 生日 |
| `status` | string | 否 | active / inactive / graduated |
| `tags` | string | 否 | 标签（逗号分隔） |
| `remark` | string | 否 | 备注 |
| `source` | string | 否 | 来源 |
| `balance` | number | 否 | 账户余额（退课折算入此） |

### Course（课程）

存储位置：SQLite `courses` 表。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识，`crs_` 前缀 |
| `name` | string | 是 | 课程名称，1-64 字符 |
| `color` | string | 否 | 颜色标签 key（10 色） |
| `billingType` | string | 否 | 计费方式：per_lesson / per_term / per_month |
| `term` | string | 否 | 学期 |
| `status` | string | 否 | active / inactive |
| `category` | string | 否 | 分类 |
| `grade` | string | 否 | 关联年级 |
| `description` | string | 否 | 描述 |

### Enrollment（报名记录，计费核心）

存储位置：SQLite `enrollments` 表。课时挂在报名记录上，按课程独立核算。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `enr_` 前缀 |
| `studentId` | string | 是 | 关联学员 |
| `courseId` | string | 是 | 关联课程 |
| `status` | string | 是 | active / settled / expired |
| `purchasedHours` | number | 是 | 购买课时数 |
| `giftHours` | number | 是 | 赠送课时数 |
| `remainingPaidHours` | number | 是 | 剩余付费课时 |
| `remainingGiftHours` | number | 是 | 剩余赠课课时 |
| `unitPrice` | number | 是 | 单价 |
| `totalAmount` | number | 是 | 总金额 |
| `paidAmount` | number | 是 | 已付金额 |
| `discountAmount` | number | 否 | 折扣金额 |
| `paymentMethod` | string | 否 | 付款方式 |
| `paymentStatus` | string | 否 | paid / unpaid / partial |
| `contractNo` | string | 否 | 合同号 |
| `expiredAt` | string | 否 | 过期时间 |
| `enrolledAt` | string | 是 | 报名时间 |

**计费规则（赠课后扣）**：
- 点名到课：先扣 `remainingPaidHours`，扣完再扣 `remainingGiftHours`
- 改缺勤：根据 `deductedEnrollmentId` + `deductedType` 精准回退（先回退赠课）
- 仅当新旧 `attended` 值不同时才扣减/回退

### Schedule（排课记录）

存储位置：SQLite `schedules` 表，按 `student_id + date` 建复合索引。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `sch_` 前缀 |
| `studentId` | string | 是 | 关联学员 |
| `studentName` | string | 是 | 学员姓名（冗余存储） |
| `classId` | string | 否 | 关联班级 |
| `courseId` | string | 否 | 关联课程 |
| `courseName` | string | 是 | 课程名（冗余） |
| `teacher` | string | 否 | 教师 |
| `location` | string | 否 | 地点 |
| `date` | string | 是 | 上课日期 `yyyy-MM-dd` |
| `startTime` | string | 否 | 开始时间 `HH:mm` |
| `endTime` | string | 否 | 结束时间 `HH:mm` |
| `attended` | boolean \| undefined | 否 | true=到课 / false=缺勤 / undefined=未点名 |
| `status` | string | 否 | scheduled / completed / cancelled / makeup |
| `makeupFor` | string | 否 | 补课关联的原排课ID |
| `rescheduledFrom` | string | 否 | 调课来源原排课ID |
| `deductedEnrollmentId` | string | 否 | 点名扣的是哪条报名 |
| `deductedType` | string | 否 | 扣的是 paid 还是 gift |
| `hasMakeup` | boolean | 否 | 是否已添加补课（前端展示用） |

**出勤三态机制**：
- `true`（到课）：按赠课后扣规则扣减报名记录课时
- `false`（缺勤）：精准回退（先回退赠课）
- `undefined`（未点名）：不扣减

### Transfer（退课结转流水）

存储位置：SQLite `transfers` 表。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `trf_` 前缀 |
| `studentId` | string | 是 | 关联学员 |
| `fromEnrollmentId` | string | 是 | 源报名记录 |
| `toEnrollmentId` | string | 否 | 目标报名（拆分模式通常为空） |
| `refundAmount` | number | 是 | 退课折算金额 |
| `giftMode` | string | 否 | discard 赠课作废 / refund 赠课也折算 |
| `reason` | string | 否 | 退课原因 |
| `note` | string | 否 | 备注 |

**退课流程**：
1. 校验源 enrollment 为 active 且有剩余课时
2. 按 giftMode 计算折算课时与金额
3. 源 enrollment 清零并标记 `settled`
4. 取消该学员该课程未来未点名排课（含补课生成的排课）
5. 金额进学员账户余额（写 account_transactions + 更新 students.balance）
6. 写 transfers 记录

### AdminUser（管理员账号）

存储位置：SQLite `admins` 表。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `adm_` 前缀 |
| `username` | string | 是 | 用户名（唯一） |
| `role` | string | 是 | superadmin / admin / teacher |
| `realName` | string | 否 | 真实姓名 |
| `phone` | string | 否 | 手机号 |
| `status` | string | 否 | active / disabled |
| `teacherId` | string | 否 | 教师角色关联的 teacherId |
| `permissions` | string | 否 | 自定义权限点（逗号分隔，非空覆盖角色默认） |
| `lastLoginAt` | string | 否 | 最近登录时间（仅后端记录） |

> `lastLoginIp` 仅后端记录，不返回前端（PII 保护）。

### AuditLog（审计日志）

存储位置：SQLite `audit_logs` 表，按月 gzip 归档到 `data/audit_archive/audit-YYYY-MM.json.gz`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | `aud_` 前缀 |
| `actorId` | string | 操作者ID |
| `actorName` | string | 操作者姓名 |
| `actorRole` | string | 操作者角色 |
| `action` | string | create / update / delete 等 |
| `module` | string | students / courses / enrollments 等 |
| `targetType` | string | 目标类型 |
| `targetId` | string | 目标ID |
| `summary` | string | 操作摘要 |
| `before` | object | 修改前快照 |
| `after` | object | 修改后快照 |
| `ip` | string | 操作IP |
| `createdAt` | string | 时间 |

### 关键校验规则

- 存储 id（studentId/courseId/scheduleId 等）：`/^[A-Za-z0-9_-]{1,64}$/`，防 SQL 注入与路径遍历
- 日期：`/^\d{4}-\d{2}-\d{2}$/`；时间：`/^\d{2}:\d{2}$/`（HH:mm）
- 学员 id、排课 id 全局唯一，重复写入被拒绝
- 排课 `studentId` 必须在学员表中存在（跨表关联校验）
- 排课 `id` 不可修改（更新时 old.id 必须等于 new.id）
- 公告 `content` 长度上限 5000 字
- 跨学员搜索 `startDate` ≤ `endDate`
- 报名记录课时已使用（`remainingPaidHours < purchasedHours` 或 `remainingGiftHours < giftHours`）时不可编辑
- 删除学员前检查是否有剩余课时，有则禁止并提示走退课流程

***

## 🛡️ 权限模型

### 三级角色

| 角色 | 权限范围 |
|------|---------|
| `superadmin` | 通配 `*`，全部权限 |
| `admin` | 37 个权限点（业务全权） |
| `teacher` | 12 个权限点（查看 + 调课/补课 + 点名 + 反馈） |

### 15 个权限模块

学员管理 / 课程管理 / 年级管理 / 班级管理 / 报名管理 / 结转退课 / 账户管理 / 排课管理 / 点名管理 / 教师管理 / 课后反馈 / 公告管理 / 报表中心 / 系统设置 / 账号中心 / 审计日志

每个模块含 view/create/update/delete 等操作权限点，共 42 个可分配权限点。

### 自定义权限

后台「账号中心」编辑账号时，可勾选权限矩阵覆盖角色默认权限。`admins.permissions` 字段存逗号分隔串，非空时覆盖角色默认。

### 鉴权流程

1. 登录返回 token（HMAC-SHA256 签名，24 小时有效）
2. 后续请求带 `Authorization: Bearer <token>`
3. `requirePermission` 校验：
   - 验签 token
   - 查库取最新角色/权限/状态（防降级后旧 token 越权）
   - 用 DB 最新角色覆写 context.admin.role（防越权读取）
   - 校验账号是否被禁用
   - 校验是否拥有指定权限点

***

## 📁 项目结构

```
pai-docker/
├── node-functions/                  # 后端 API
│   ├── _lib/
│   │   ├── auth.js                  # HMAC-SHA256 鉴权 + RBAC + PBKDF2 哈希 + 限流 IP 提取
│   │   ├── audit.js                 # 审计日志写入助手
│   │   ├── config-file.js           # config.json 读写（7 项配置，内存缓存）
│   │   ├── cron.js                  # cron 表达式解析（备份调度）
│   │   ├── id.js                    # ID 生成器（前缀+时间戳+计数器+随机）
│   │   ├── rate-limit.js            # 内存滑动窗口限流
│   │   ├── store.js                 # 数据访问层 re-export
│   │   ├── time.js                  # 时区工具（Asia/Shanghai）
│   │   └── store/                   # 各业务表数据访问模块
│   │       ├── core.js              # SQLite 连接 + 14 张表 schema + 兼容迁移
│   │       ├── students.js          # 学员档案 + deleteStudentWithSchedules
│   │       ├── courses.js / grades.js / classes.js
│   │       ├── schedules.js / enrollments.js / transfers.js
│   │       ├── accounts.js / attendance.js / feedback.js
│   │       ├── teachers.js / reports.js / admins.js
│   │       ├── audit.js / audit-archive.js / announcements.js
│   │       ├── backups.js / schedule-changes.js
│   │       └── ...
│   └── api/                         # 51 个 API 处理器（按文件名自动映射路由）
│       ├── auth.js                  # 登录/校验/引导创建超管
│       ├── parent-access.js         # 家长端 H5（限流）
│       ├── students.js / student-add.js / student-update.js / student-delete.js
│       ├── courses.js / course-add.js / course-update.js / course-delete.js
│       ├── grades.js / grade-add.js / grade-update.js / grade-delete.js / grade-promote.js
│       ├── classes.js / class-add.js / class-update.js / class-delete.js / class-members.js
│       ├── schedules.js / schedules-search.js
│       ├── schedule-add.js / schedule-add-batch.js / schedule-update.js / schedule-delete.js
│       ├── schedule-makeup.js / schedule-reschedule.js / schedule-changes.js
│       ├── attendance.js            # 点名（赠课后扣）
│       ├── enrollments.js / enrollment-add.js / enrollment-update.js / enrollment-delete.js
│       ├── transfers.js / transfer-add.js
│       ├── account-transactions.js
│       ├── feedback.js / teacher-performance.js
│       ├── admins.js / admin-add.js / admin-update.js / admin-delete.js
│       ├── permission-definitions.js
│       ├── announcement.js / config.js
│       ├── reports.js               # 6 种报表
│       ├── audit-logs.js / audit-archives.js
│       ├── backups.js / expire.js
│       └── ...
├── src/                             # 前端源码
│   ├── api/
│   │   ├── admin.ts                 # 后台 API 调用层（带 token）
│   │   └── index.ts                 # 公开 API 调用层
│   ├── components/
│   │   ├── Admin/                   # 后台管理组件（19 个子页面）
│   │   │   ├── AdminPanel.tsx       # 后台主框架（侧边栏 4 分类 + 14 模块入口）
│   │   │   ├── AdminLogin.tsx       # 登录页
│   │   │   ├── Bootstrap.tsx        # 超管引导创建页
│   │   │   ├── StudentAdmin.tsx / CourseAdmin.tsx
│   │   │   ├── GradeAdmin.tsx / ClassesAdmin.tsx
│   │   │   ├── EnrollmentAdmin.tsx / TransferAdmin.tsx
│   │   │   ├── ScheduleAdmin.tsx / ScheduleAddModal.tsx / ScheduleEditor.tsx / RescheduleModal.tsx
│   │   │   ├── AttendanceAdmin.tsx
│   │   │   ├── AnnouncementAdmin.tsx / ShareLinksAdmin.tsx
│   │   │   ├── AdminUserAdmin.tsx / AuditLogAdmin.tsx
│   │   │   ├── ReportsAdmin.tsx / TeacherAdmin.tsx
│   │   │   └── SystemSettingsAdmin.tsx
│   │   ├── Announcement/Announcement.tsx  # 公告弹窗（Markdown 渲染）
│   │   ├── Calendar/                # 日历视图（月/周/日）
│   │   ├── Home/Home.tsx            # 简洁首页
│   │   ├── Parent/ParentH5.tsx      # 家长端 H5
│   │   ├── ui/                      # 基础 UI + shadcn 组件
│   │   ├── SearchBar.tsx            # 学员搜索框
│   │   ├── ScheduleCard.tsx         # 排课卡片
│   │   └── ScheduleDetail.tsx       # 排课详情弹窗
│   ├── hooks/use-mobile.ts          # 响应式 hook
│   ├── types/index.ts               # TypeScript 类型定义（25+ 接口）
│   ├── utils/
│   │   ├── permission.ts            # 前端权限判断
│   │   ├── cn.ts / date.ts / tz.ts / money.ts / cron.ts / courseColors.ts / auth.ts
│   ├── config.ts                    # 前端配置集中导出
│   ├── App.tsx                      # 应用根组件（页面模式路由）
│   └── main.tsx                     # React 入口
├── scripts/
│   └── test_suite.py                # 端到端测试套件（Python requests，192+ 测试项）
├── .github/workflows/
│   └── docker-publish.yml           # GitHub Actions：多架构构建推送 GHCR
├── Dockerfile                       # 多阶段构建（非 root 用户运行）
├── docker-compose.yml               # Compose 编排
├── server.js                        # Node HTTP 服务器（路由 + 静态托管 + 安全头 + 限流）
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

***

## 📄 License

MIT
