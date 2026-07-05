# 排课日历系统

基于日历视角的学员排课查询与管理系统，部署于腾讯云 EdgeOne Makers 边缘网络，全球 3200+ 节点加速访问。

前端为单页应用（SPA），后端为 Node Functions（边缘函数），数据存储于 EdgeOne Blob（分布式对象存储），整套系统无需独立服务器。

项目名称、公告栏内容、GitHub 链接均通过环境变量注入，可在不修改代码的情况下完成自定义。

## 特性

### 简洁首页

- **类百度首页**：项目名称居中展示 + 学员搜索框 + 进入日历 / 后台管理两个入口按钮
- **首页搜索直达日历**：在首页搜索框选中学员后自动跳转至日历二级页并加载该学员排课
- **后台管理入口**：首页直接提供「后台管理」按钮，无需进入日历页再点击
- **可配置项目名称**：通过 `VITE_APP_NAME` 环境变量自定义首页与各页标题

### 公告栏

- 内容由管理员在后台「进阶管理 → 公告设置」中编辑保存，存储于 EdgeOne Blob（`config/announcement.json`）
- 前端启动时异步加载（`GET /api/announcement`，无需鉴权），不阻塞主流程
- 同时展示在首页与日历二级页（位于学员信息条与日历之间）
- 支持多行文本（按回车换行），内容过多时限定最大高度并上下滚动查看
- 内容为空时自动隐藏，不占用页面空间
- 单条上限 5000 字，保存即生效，所有用户下次加载页面时即可看到最新公告

### 日历视图

- **月视图**：6×7 网格展示当月排课，每格最多 3 条卡片，超出显示「+N 更多」，含上下月填充与今日高亮
- **周视图**：周一至周日 7 列并排展示，按日期+时间排序
- **日视图**：按上午 / 下午 / 晚上三个时段分组展示
- **视图导航**：上一段 / 下一段 / 今天按钮，按当前视图粒度跳转
- **响应式布局**：手机 / 平板 / 桌面三端自适应

### 学员查询

- **精确+模糊双模式**：一次请求同时完成两种匹配，精确结果始终排在前面
- **防抖搜索**：输入后 250ms 延迟触发，减少无效 API 调用
- **键盘导航**：支持 ↑↓ 选择、Enter 确认、Esc 关闭
- **点击外部自动收起**

### 排课详情

- 点击任意排课卡片弹出详情弹窗
- 展示课程名称、教师、地点、日期、时间、学员等完整信息
- 支持 ESC 键关闭、点击遮罩关闭

### 后台管理

- **密码登录**：基于环境变量注入密码，HMAC-SHA256 签名 token，常量时间比较防时序攻击，token 有效期 24 小时
- **种子数据初始化**：一键写入 8 名示例学员及对应月份排课，用于演示验证
- **一键清空数据**：二次确认防误操作
- **公告设置**：进阶管理页内编辑公告内容（多行文本，上限 5000 字），保存即生效，前端异步加载展示
- **排课列表管理**：按学员查看排课，支持单条编辑与删除
- **新增单条排课**：弹窗表单快速新增少量排课，自动生成 ID、默认今日日期、校验学员关联与重复 ID
- **学员管理**：查看全部学员列表，支持删除学员及其所有排课数据（二次确认）
- **跨月/跨学员迁移**：修改排课日期或学员时自动处理存储路径迁移，空文件自动清理

### 性能优化

- **按月分文件存储**：日期范围查询仅读取对应月份，减少数据传输
- **并行读取**：多月数据通过 `Promise.all` 并行加载，总延迟≈单次延迟
- **useMemo / useCallback**：缓存日期计算与事件处理函数，避免不必要重渲染
- **边缘 CDN 缓存**：静态资源全球边缘节点就近响应
- **强一致按需**：Blob 默认最终一致，写入操作使用 strong 模式，平衡性能与一致性

### 安全

- 全站 HTTPS，SSL 证书自动签发
- DDoS 防护、速率限制、IP/Referer/UA 黑白名单（平台内置）
- 写操作均需鉴权，密码仅存于环境变量，代码中无硬编码
- 401 响应自动清除前端 token 并跳转登录页
- 清空操作需二次确认，删除单条排课需一次确认

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 | 组件化开发，Hook 模式状态管理 |
| 构建工具 | Vite 5 | 极速构建，ESM 原生支持，产物适合 CDN 部署 |
| 类型系统 | TypeScript 5 | 类型安全，提升可维护性 |
| 样式方案 | TailwindCSS 3 | 原子化 CSS，响应式设计开箱即用 |
| 日期处理 | date-fns 3 | 函数式日期库，按需引入，支持中文本地化 |
| 后端运行时 | Node Functions（Edge Runtime） | 毫秒级冷启动，全球边缘节点执行 |
| 数据存储 | EdgeOne Pages Blob | 分布式对象存储，支持目录层级与强一致 |
| 部署平台 | 腾讯云 EdgeOne Makers | 全球边缘节点加速，Git 集成自动部署 |

## 部署流程

### 前置条件

1. 腾讯云账号（已实名认证）
2. GitHub / Gitee 代码仓库
3. 已开通 EdgeOne Makers（免费版即可）

### 步骤一：推送代码到 Git 仓库

```bash
git add .
git commit -m "排课日历系统"
git remote add origin https://github.com/<your-username>/pai.git
git push -u origin main
```

### 步骤二：EdgeOne Makers 控制台创建项目

1. 登录 [EdgeOne Makers 控制台](https://console.cloud.tencent.com/edgeone/pages)
2. 点击「创建项目」→「连接 Git 仓库」
3. 授权并选择目标仓库
4. 平台自动识别 Vite 框架，构建配置：
   - **构建命令**：`npm run build`
   - **输出目录**：`dist`
   - **Node 版本**：18+
5. 点击「部署」，等待自动构建完成（约 30-60 秒）

### 步骤三：配置环境变量

在 Makers 控制台进入项目「设置」→「环境变量与密钥」，添加：

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `ADMIN_PASSWORD` | Secret | 后台管理登录密码（必填，否则后台功能不可用） |
| `VITE_APP_NAME` | Plain | 项目名称，显示在首页与各页标题，如「排课日历系统」「XX培训排课」等。未设置时默认为「排课日历系统」 |

> 提示：以 `VITE_` 开头的变量会在构建时被注入到前端产物中，修改后需重新触发部署（推送代码或在控制台重新部署）才能生效。`ADMIN_PASSWORD` 仅后端读取，修改即时生效。
>
> 公告内容通过后台「进阶管理 → 公告设置」动态管理，存储于 EdgeOne Blob，无需环境变量配置。
>
> 页脚的 GitHub 链接硬编码为本仓库地址 `https://github.com/mxlitey/pai`，无需通过环境变量配置。如需替换为其他链接，修改 [`src/config.ts`](src/config.ts) 中的 `GITHUB_URL` 即可。

### 步骤四：验证部署

平台分配预览域名，如 `https://pai-xxx.edgeone.site`。

1. 访问预览域名，确认简洁首页正常加载（项目名称取自 `VITE_APP_NAME`，未设置时为「排课日历系统」）
2. 在首页搜索框输入学员姓名，自动跳转到日历二级页并加载该学员排课
3. 切换月 / 周 / 日视图，确认排课数据正确展示
4. 点击首页「后台管理」按钮，输入密码登录验证管理功能
5. 检查页脚是否显示「排课系统」及 GitHub 链接（已硬编码为本仓库地址）

### 步骤五：初始化数据

部署完成后 Blob 存储为空，可通过「种子数据初始化」一键写入 8 名示例学员及对应排课用于演示验证：

后台管理面板 → 「进阶管理」→「数据管理」→ 点击「导入测试数据」按钮。

正式数据请在后台通过「学员管理」「课程管理」「排课管理」逐条录入。

### 步骤六：绑定自定义域名（可选）

1. 在 Makers 控制台「项目设置」→「域名管理」
2. 添加自定义域名，如 `schedule.example.com`
3. 在域名 DNS 服务商添加 CNAME 记录指向 EdgeOne
4. 平台自动签发 SSL 证书

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/announcement` | 否 | 公开读取公告内容（首页与日历页异步加载） |
| GET | `/api/students?q=` | 否 | 学员搜索（精确+模糊） |
| GET | `/api/schedules?studentId=&startDate=&endDate=` | 否 | 排课查询（按学员ID + 日期范围） |
| GET | `/api/schedules?studentName=&startDate=&endDate=` | 否 | 排课查询（按学员姓名 + 日期范围） |
| POST | `/api/auth` | 否 | 后台登录，返回 token |
| POST | `/api/seed` | 是 | 初始化种子数据 |
| POST | `/api/clear` | 是 | 清空所有数据 |
| POST | `/api/announcement` | 是 | 保存公告内容（后台进阶管理页） |
| PUT | `/api/schedule-update` | 是 | 修改排课（含跨月/跨学员迁移） |
| POST | `/api/schedule-add` | 是 | 新增单条排课（含字段格式与跨表关联校验、重复 ID 拒绝） |
| DELETE | `/api/schedule-delete` | 是 | 删除单条排课 |
| DELETE | `/api/student-delete` | 是 | 删除学员及其所有排课 |

## 数据结构

系统涉及三类核心实体：学员（Student）、课程（Course）、排课（Schedule）。TypeScript 类型定义见 [`src/types/index.ts`](src/types/index.ts)。

### Student（学员）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 学员唯一标识，如 `s001` |
| `name` | string | 是 | 学员姓名 |
| `phone` | string | 否 | 联系电话 |
| `grade` | string | 否 | 年级，如 `高三` |

存储位置：`students/index.json`，内容为 `Student[]`。

### Course（课程）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 课程唯一标识，如 `math01` |
| `name` | string | 是 | 课程名称，如 `数学提高班` |
| `teacher` | string | 否 | 授课教师 |
| `location` | string | 否 | 上课地点 |
| `color` | string | 否 | 颜色标签 key，如 `blue`/`green`，用于日历卡片配色 |
| `defaultStartTime` | string | 否 | 默认开始时间，格式 `HH:mm` |
| `defaultEndTime` | string | 否 | 默认结束时间，格式 `HH:mm` |

存储位置：`courses/index.json`，内容为 `Course[]`。

### Schedule（排课记录）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 排课唯一标识，如 `c0001` |
| `studentId` | string | 是 | 关联学员 id，必须存在于学员表 |
| `studentName` | string | 是 | 学员姓名（冗余字段，学员改名时后端会级联更新） |
| `courseId` | string | 否 | 关联课程 id（历史数据可能为空） |
| `courseName` | string | 是 | 课程名称 |
| `teacher` | string | 是 | 教师 |
| `location` | string | 是 | 地点 |
| `date` | string | 是 | 上课日期，格式 `yyyy-MM-dd` |
| `startTime` | string | 是 | 开始时间，格式 `HH:mm` |
| `endTime` | string | 是 | 结束时间，格式 `HH:mm` |
| `note` | string | 否 | 备注 |
| `color` | string | 否 | 颜色标签 key，从课程带过来，用于日历卡片配色 |

存储位置：`schedules/{studentId}/{yyyy-MM}.json`，按学员 ID + 月份分文件存储，内容为 `Schedule[]`。该设计的优势：

- **按月分文件**：日历的月/周/日视图查询仅需读取对应月份文件，减少数据传输
- **并行加载**：跨月查询通过 `Promise.all` 并行读取多个文件，总延迟≈单次延迟
- **跨月/跨学员迁移**：修改排课日期或学员时，后端自动从旧文件移除并写入新文件，空文件自动清理

### Announcement（公告）

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | 公告正文，支持多行；空字符串等价于无公告 |
| `updatedAt` | string | 最近一次保存时间，ISO 8601 字符串 |

存储位置：`config/announcement.json`，单文件存储。前端启动时通过 `GET /api/announcement` 异步加载，无需鉴权；管理员通过 `POST /api/announcement` 保存。

### 关键校验规则

- 学员 `id`、排课 `id` 全局唯一，重复写入会被拒绝
- 排课 `studentId` 必须在学员表中存在（跨表关联校验）
- 排课 `date` 必须匹配 `yyyy-MM-dd`，`startTime`/`endTime` 必须匹配 `HH:mm`
- 排课按 `date` 升序、`startTime` 升序持久化存储
- 公告 `content` 长度上限 5000 字

## 项目结构

```
pai/
├── node-functions/              # 后端 Node Functions
│   ├── _lib/
│   │   ├── auth.js              # HMAC 签名与鉴权中间件
│   │   ├── store.js             # Blob 存储封装
│   │   └── seed-data.js         # 种子数据生成
│   └── api/
│       ├── announcement.js        # 公告读取（GET 公开）/ 保存（POST 鉴权）
│       ├── auth.js              # 登录验证
│       ├── students.js          # 学员查询
│       ├── schedules.js         # 排课查询
│       ├── seed.js              # 种子初始化
│       ├── clear.js             # 清空数据
│       ├── schedule-add.js      # 新增单条排课
│       ├── schedule-update.js   # 排课修改
│       ├── schedule-delete.js   # 排课删除
│       └── student-delete.js    # 学员删除（含其排课）
├── scripts/                     # 工具脚本
│   └── seed-data.mjs            # 种子数据初始化脚本
├── src/                         # 前端源码
│   ├── api/                     # API 调用层
│   ├── components/
│   │   ├── Admin/               # 后台管理组件
│   │   ├── Announcement/        # 公告栏组件（环境变量注入内容）
│   │   ├── Calendar/            # 日历视图组件
│   │   └── Home/                # 简洁首页组件（类百度）
│   ├── config.ts                # 环境变量集中导出（项目名/公告/GitHub 链接/页脚）
│   ├── types/                   # TypeScript 类型定义
│   ├── utils/                   # 工具函数
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts            # Vite 环境变量类型声明
├── docs/系统设计方案.md
├── index.html
├── package.json
└── vite.config.ts
```
