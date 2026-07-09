<div align="center">
  <h1>📅 排课系统</h1>
  <p>基于日历视角的学员排课查询与管理系统</p>
  <p>Docker 自托管 · SQLite 单文件持久化 · 零配置启动</p>
</div>

***

## 📖 项目介绍

排课系统是一套面向教育培训场景的学员排课查询与管理系统。前端为 React 单页应用，后端运行于 Node.js，数据存储使用 SQLite（单文件持久化），适合私有服务器、内网或单机场景，无需外部数据库。

家长通过专属分享链接或学员姓名搜索即可查看排课日历（月/周/日三视图），管理员通过密码登录后台一站式管理学员、课程、排课、点名、公告与分享链接。点名按课程→时间段两级分组，三态出勤自动联动课时扣减；公告支持 Markdown 渲染并按发布时间版本控制弹窗。

系统采用**零配置启动**：超管账号首次访问时引导创建，token 签名密钥首次启动自动生成，项目名称等配置通过后台「系统设置」页面动态修改，无需任何环境变量。

***

## ✨ 功能特性

### 首页
- 🏠 **类百度简洁首页**：项目名称居中 + 学员搜索框 + 查看排课入口
- 🔍 **智能搜索**：精确 + 模糊双模式匹配，防抖 250ms，键盘 ↑↓ Enter Esc 导航
- 📢 **公告展示**：Markdown 渲染，内容为空时自动隐藏

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

### 课时统计
- 🕒 **剩余课时**：学员信息栏实时展示「剩余 / 总」课时，用完红色高亮
- ✅ **自动扣减**：点名到课自动 -1，改缺勤自动 +1 回退
- 🎯 **差额联动**：编辑学员总课时按差额自动调整剩余课时

### 后台管理
- 👥 **学员管理**：分页表格、新增 / 编辑 / 删除（二次确认）、ID 自动生成、姓名变更级联更新排课
- 📚 **课程管理**：10 色颜色标签、默认时段记忆、删除同时清理关联排课
- 🗂️ **排课管理**：双 tab（按学员 / 按日期+课程筛选）、单条新增、批量新增（日期×学员笛卡尔积）
- ✅ **点名管理**：按日期加载，课程→时间段两级分组，三态出勤，时间段级与全局批量操作
- 📢 **公告管理**：编辑 / 预览双 tab，Markdown 实时渲染，字数统计
- 🔗 **分享链接**：一键生成全部学员查看链接，单条 / 全量复制
- ⚙️ **系统设置**：后台动态修改项目名称，运行时即时生效

### 公告弹窗
- 🔔 **版本控制**：按公告发布时间标记，同一版本仅自动弹一次
- 🆕 **更新提醒**：管理员重新编辑公告后，家长下次进入自动再弹
- ⌨️ **便捷关闭**：ESC 键 / 点遮罩 / 关闭按钮

### 安全与性能
- 🔐 **鉴权**：HMAC-SHA256 签名 token，与登录密码解耦，24 小时有效
- 🛡️ **并发安全**：SQLite WAL 模式 + ACID 事务，读不阻塞写
- 🚫 **防注入**：存储 id 校验 `/^[A-Za-z0-9_-]{1,64}$/`，参数化查询
- 🔑 **密码哈希**：PBKDF2-HMAC-SHA256（100000 次迭代）加盐存储
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
| 日期处理 | date-fns 3 | 函数式日期库，中文本地化 |
| Markdown | react-markdown + remark-gfm | 公告渲染，GFM 语法 |
| 后端运行时 | Node.js 18+ | 原生 HTTP 服务器 |
| 数据存储 | SQLite（better-sqlite3） | 单文件持久化，同步 API |
| 鉴权 | Web Crypto API | HMAC-SHA256 自实现 token + PBKDF2 密码哈希 |
| 部署方式 | Docker | 多阶段构建，Volume 挂载持久化 |

***

## 🚀 部署流程

### 前置条件

1. 已安装 Docker（20.10+）与 Docker Compose（可选）
2. 服务器开放对外端口（默认 8788）

> 本项目**零配置启动**：无需任何环境变量，token 密钥、项目名称等配置全部由系统自动生成或通过后台管理界面设置。

### 首次部署：超管账号引导创建

系统取消了固定密码，改为**首次访问时引导创建超管账号**，为后期多账号体系预留。流程：

1. 启动容器后访问 `http://<服务器IP>:8788`
2. 系统检测到 admin 表为空，自动跳转到引导页
3. 设置超管密码（至少 6 位）并确认
4. 创建成功后跳转到登录页，使用刚设置的密码登录

> 引导接口 `POST /api/auth/bootstrap` 仅在系统未初始化时可用，创建成功后自动关闭。
>
> 超管账号用户名固定为 `admin`，密码使用 PBKDF2-HMAC-SHA256 加盐哈希存储于 SQLite，不存明文。

### 方式一：docker run

```bash
docker run -d \
  --name pai \
  -p 8788:8788 \
  -v pai-data:/app/data \
  --restart unless-stopped \
  pai:latest
```

### 方式二：docker-compose（推荐）

新建 `docker-compose.yml`：

```yaml
services:
  pai:
    build: .
    image: pai:latest
    container_name: pai
    restart: unless-stopped
    ports:
      - "8788:8788"
    volumes:
      - pai-data:/app/data

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

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `PORT` | 否 | 服务监听端口，默认 8788 |
| `DATA_DIR` | 否 | 数据目录，默认 `/app/data`，对应容器内路径 |

> ⚠️ 本项目**无需任何业务配置环境变量**：
> - 超管密码通过首次访问引导页设置
> - Token 签名密钥由系统首次启动自动生成 32 字节随机值并持久化到 config.json
> - 项目名称等系统配置在后台「系统设置」页面动态修改
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
3. 使用刚设置的密码登录后台，验证管理功能
4. 进入后台「系统设置」修改项目名称，确认首页标题随之更新
5. 首页搜索框输入学员姓名，验证排课查询
6. 反向代理（可选）：使用 Nginx / Caddy 转发至 `127.0.0.1:8788` 并配置 HTTPS

### 数据备份与恢复

- **备份**：复制整个 `/app/data` 目录（含 `pai.db` 业务数据与 `config.json` 系统配置），缺一不可——丢失 `config.json` 会导致 tokenSecret 重置，所有已签发 token 失效
- **恢复**：将备份的 `/app/data` 目录挂载回容器重启即可
- **重置超管密码**：停止容器，删除 `/app/data/pai.db` 中的 admin 表记录后重启，会重新进入引导流程（**仅清除管理员账号，业务数据与系统配置不受影响**）

### 后续规划（已预留扩展点）

- **多账号体系**：SQLite 已建 `admin` 表（含 `role` 字段），当前固定单超管，后期可扩展多账号与角色权限
- **更多系统配置**：高频读取的系统配置（appName、tokenSecret）已存于 `config.json`，后续可扩展更多配置项；低频配置可继续走 SQLite

***

## 📡 API 一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/config` | 否 | 公开读取系统配置（appName 等前端首屏需要的配置） |
| PUT | `/api/config` | 是 | 修改系统配置（appName 等） |
| GET | `/api/announcement` | 否 | 公开读取公告内容（`{content, updatedAt}`） |
| POST | `/api/announcement` | 是 | 保存公告（最大 5000 字，空内容等价清空） |
| GET | `/api/students` | 否 | 学员列表；带 `?q=` 时按精确+模糊搜索 |
| GET | `/api/schedules` | 否 | 按 `studentId` 或 `studentName` + 可选日期范围查询排课 |
| GET | `/api/schedules-search` | 是 | 跨学员搜索排课，参数 `startDate`/`endDate`/`courseId` 任一可缺省 |
| GET | `/api/courses` | 是 | 获取全部课程 |
| POST | `/api/course-add` | 是 | 新增课程 |
| PUT | `/api/course-update` | 是 | 更新课程 |
| DELETE | `/api/course-delete` | 是 | 删除课程及所有关联排课 |
| POST | `/api/student-add` | 是 | 新增学员 |
| PUT | `/api/student-update` | 是 | 更新学员（姓名变更级联更新排课） |
| DELETE | `/api/student-delete` | 是 | 删除学员及其所有排课 |
| POST | `/api/schedule-add` | 是 | 新增单条排课（校验学员存在） |
| POST | `/api/schedule-add-batch` | 是 | 批量新增排课（日期×学员笛卡尔积） |
| PUT | `/api/schedule-update` | 是 | 修改排课 |
| DELETE | `/api/schedule-delete` | 是 | 删除单条排课 |
| GET | `/api/attendance?date=` | 是 | 获取指定日期所有排课（含出勤状态） |
| POST | `/api/attendance` | 是 | 批量设置点名，自动扣减/回退学员剩余课时 |
| POST | `/api/auth` | 否 | 登录，返回 token |
| GET | `/api/auth` | 是 | 校验 token 有效性 |
| GET | `/api/auth/bootstrap` | 否 | 查询引导状态（前端决定是否展示引导页） |
| POST | `/api/auth/bootstrap` | 否 | 引导创建超管账号（仅在系统未初始化时可用） |

***

## 🗂️ 数据结构

系统涉及三类核心存储实体：学员（Student）、课程（Course）、排课（Schedule），以及公告（Announcement）。TypeScript 类型定义见 [`src/types/index.ts`](src/types/index.ts)。

### Student（学员）

存储位置：SQLite `students` 表。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识，`/^[A-Za-z0-9_-]{1,64}$/`，前端默认生成 `stu_` 前缀 |
| `name` | string | 是 | 姓名，1-32 字符 |
| `grade` | string | 否 | 年级，如「高三」 |
| `hours` | number | 否 | 总课时（购课总数），非负整数 |
| `remainingHours` | number | 否 | 剩余课时，非负整数；新增时 = hours；点名到课 -1，缺勤 +1 |

### Course（课程）

存储位置：SQLite `courses` 表。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识，前端默认生成 `c_` 前缀 |
| `name` | string | 是 | 课程名称，1-64 字符 |
| `teacher` | string | 否 | 授课教师 |
| `location` | string | 否 | 上课地点 |
| `color` | string | 否 | 颜色标签 key：blue/green/purple/orange/rose/teal/amber/indigo/cyan/pink |
| `defaultStartTime` | string | 否 | 默认开始时间，格式 `HH:mm` |
| `defaultEndTime` | string | 否 | 默认结束时间，格式 `HH:mm` |

### Schedule（排课记录）

存储位置：SQLite `schedules` 表，按 `student_id + date` 建复合索引。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识，由时间戳 + 计数器 + 随机后缀生成 |
| `studentId` | string | 是 | 关联学员 id，必须存在于学员表 |
| `studentName` | string | 是 | 学员姓名（冗余存储，学员改名时级联更新） |
| `courseId` | string | 否 | 关联课程 id（历史数据可能为空） |
| `courseName` | string | 是 | 课程名称 |
| `teacher` | string | 否 | 教师 |
| `location` | string | 否 | 地点 |
| `date` | string | 是 | 上课日期，格式 `yyyy-MM-dd` |
| `startTime` | string | 否 | 开始时间，格式 `HH:mm` |
| `endTime` | string | 否 | 结束时间，格式 `HH:mm` |
| `note` | string | 否 | 备注 |
| `color` | string | 否 | 颜色标签 key，从课程带过来 |
| `attended` | boolean \| undefined | 否 | 出勤状态：`true`=到课，`false`=缺勤，`undefined`=未点名 |

**出勤三态机制**：
- `true`（到课）：点名时学员 `remainingHours` 自动 -1
- `false`（缺勤）：点名时学员 `remainingHours` 自动 +1（回退）
- `undefined`（未点名）：不扣减
- 仅当新旧 `attended` 值不同时才扣减/回退，避免重复操作

### Announcement（公告）

存储位置：SQLite `announcement` 表（单行，id=1）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | Markdown 正文，最大 5000 字，空字符串等价于无公告 |
| `updatedAt` | string | 是 | 最近保存时间，ISO 8601 字符串，保存时自动写入 |

**版本控制机制**：前端进入日历页时检查 localStorage key `ann_seen_${updatedAt}`，不存在则自动弹出公告弹窗并写入标记；管理员重新编辑公告后 `updatedAt` 变化，下次进入自动再弹。

### 关键校验规则

- 存储 id（studentId/courseId/scheduleId）：`/^[A-Za-z0-9_-]{1,64}$/`，防 SQL 注入与路径遍历
- 日期：`/^\d{4}-\d{2}-\d{2}$/`；时间：`/^\d{2}:\d{2}$/`（HH:mm）
- 学员 id、排课 id 全局唯一，重复写入被拒绝
- 排课 `studentId` 必须在学员表中存在（跨表关联校验）
- 排课 `id` 不可修改（更新时 old.id 必须等于 new.id）
- 学员 `hours` / `remainingHours` 需为非负整数
- 公告 `content` 长度上限 5000 字
- 跨学员搜索 `startDate` ≤ `endDate`

***

## 📁 项目结构

```
pai-docker/
├── node-functions/                  # 后端 API
│   ├── _lib/
│   │   ├── auth.js                  # HMAC-SHA256 鉴权、token 签发校验、PBKDF2 密码哈希
│   │   ├── config-file.js           # config.json 读写（appName、tokenSecret，内存缓存）
│   │   ├── id.js                    # 排课 id 生成器
│   │   └── store.js                 # SQLite 存储层、数据操作
│   └── api/                         # 各业务接口
│       ├── announcement.js          # 公告读取(公开)/保存(鉴权)
│       ├── attendance.js            # 点名管理
│       ├── auth.js                  # 登录/校验/引导创建超管
│       ├── config.js                # 系统配置读取(公开)/修改(鉴权)
│       ├── courses.js               # 课程列表
│       ├── course-add.js            # 新增课程
│       ├── course-update.js         # 更新课程
│       ├── course-delete.js         # 删除课程
│       ├── students.js              # 学员搜索(公开)
│       ├── student-add.js           # 新增学员
│       ├── student-update.js        # 更新学员
│       ├── student-delete.js        # 删除学员
│       ├── schedules.js             # 排课查询(公开)
│       ├── schedules-search.js      # 跨学员搜索
│       ├── schedule-add.js          # 新增单条排课
│       ├── schedule-add-batch.js    # 批量新增排课
│       ├── schedule-update.js       # 修改排课
│       └── schedule-delete.js       # 删除排课
├── src/                             # 前端源码
│   ├── api/
│   │   ├── admin.ts                 # 后台 API 调用层(带 token)
│   │   └── index.ts                 # 公开 API 调用层
│   ├── components/
│   │   ├── Admin/                   # 后台管理组件
│   │   │   ├── AdminPanel.tsx       # 后台主框架
│   │   │   ├── AdminLogin.tsx       # 登录页
│   │   │   ├── Bootstrap.tsx        # 超管引导创建页
│   │   │   ├── SystemSettingsAdmin.tsx # 系统设置(修改项目名称)
│   │   │   ├── StudentAdmin.tsx     # 学员管理
│   │   │   ├── CourseAdmin.tsx      # 课程管理
│   │   │   ├── ScheduleAdmin.tsx    # 排课管理
│   │   │   ├── ScheduleAddModal.tsx # 批量新增排课
│   │   │   ├── ScheduleEditor.tsx   # 排课编辑弹窗
│   │   │   ├── AttendanceAdmin.tsx  # 点名管理
│   │   │   ├── AnnouncementAdmin.tsx# 公告管理
│   │   │   └── ShareLinksAdmin.tsx  # 分享链接
│   │   ├── Announcement/
│   │   │   └── Announcement.tsx     # 公告栏(Markdown 渲染)
│   │   ├── Calendar/                # 日历视图
│   │   │   ├── CalendarToolbar.tsx
│   │   │   ├── MonthView.tsx
│   │   │   ├── WeekView.tsx
│   │   │   └── DayView.tsx
│   │   ├── Home/
│   │   │   └── Home.tsx             # 简洁首页
│   │   ├── ScheduleCard.tsx         # 排课卡片
│   │   ├── ScheduleDetail.tsx       # 排课详情弹窗
│   │   └── SearchBar.tsx            # 学员搜索框
│   ├── types/index.ts               # TypeScript 类型定义
│   ├── utils/                       # 工具函数
│   ├── config.ts                    # 前端配置集中导出
│   ├── App.tsx                      # 应用根组件
│   └── main.tsx                     # React 入口
├── Dockerfile                       # 多阶段构建（builder 编译前端 + runtime 运行）
├── docker-compose.yml               # Compose 编排
├── server.js                        # Node HTTP 服务器（路由 + 静态托管）
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

***

## 📄 License

MIT
