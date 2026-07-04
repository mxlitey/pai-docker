# 排课日历系统

基于日历视角的学员排课查询与管理系统，部署于腾讯云 EdgeOne Makers 边缘网络，全球 3200+ 节点加速访问。

前端为单页应用（SPA），后端为 Node Functions（边缘函数），数据存储于 EdgeOne Blob（分布式对象存储），整套系统无需独立服务器。

## 特性

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
- **JSON 数据导入**：支持粘贴文本或上传 `.json` 文件，提供 merge（追加合并，按 id 去重）/ replace（替换清空后写入）两种模式
- **Excel 数据导入**：通过模板填写后转 JSON 再导入，含字段校验与跨表关联校验
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
| 数据导入 | xlsx（SheetJS） | Excel 模板解析与生成 |

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

### 步骤四：验证部署

平台分配预览域名，如 `https://pai-xxx.edgeone.site`。

1. 访问预览域名，确认页面正常加载
2. 输入学员姓名搜索，确认搜索功能正常
3. 切换月 / 周 / 日视图，确认排课数据正确展示
4. 点击右上角「后台管理」，输入密码登录验证管理功能

### 步骤五：初始化数据

部署完成后 Blob 存储为空，需通过以下任一方式写入数据：

**方式 A：种子数据初始化（演示用）**

后台管理面板 → 「初始化种子数据」按钮，一键写入 8 名示例学员及对应排课。

**方式 B：JSON 数据导入**

后台管理面板 → JSON 数据导入区，粘贴 JSON 或上传 `.json` 文件。JSON 结构：

```json
{
  "mode": "merge",
  "students": [
    { "id": "s001", "name": "张伟", "phone": "13800001001", "grade": "高三" }
  ],
  "schedules": [
    {
      "id": "c0001",
      "studentId": "s001",
      "courseName": "数学提高班",
      "teacher": "张老师",
      "location": "A教室201",
      "date": "2026-08-03",
      "startTime": "09:00",
      "endTime": "10:30",
      "note": ""
    }
  ]
}
```

**方式 C：Excel 数据导入（批量录入）**

1. 在仓库 `scripts/` 下生成 Excel 模板：`node scripts/generate-excel-template.mjs`
2. 打开 `scripts/排课数据导入模板.xlsx`，在「学员表」「排课表」工作表填写数据
3. 转 JSON：`node scripts/excel-to-json.mjs scripts/排课数据导入模板.xlsx`
4. 导入线上：`node scripts/import-data.mjs https://pai-xxx.edgeone.site scripts/import-data.json`

> 脚本需 Node.js 18+（使用原生 `fetch`）。

### 步骤六：绑定自定义域名（可选）

1. 在 Makers 控制台「项目设置」→「域名管理」
2. 添加自定义域名，如 `schedule.example.com`
3. 在域名 DNS 服务商添加 CNAME 记录指向 EdgeOne
4. 平台自动签发 SSL 证书

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/students?q=` | 否 | 学员搜索（精确+模糊） |
| GET | `/api/schedules?studentId=&startDate=&endDate=` | 否 | 排课查询（按学员ID + 日期范围） |
| GET | `/api/schedules?studentName=&startDate=&endDate=` | 否 | 排课查询（按学员姓名 + 日期范围） |
| POST | `/api/auth` | 否 | 后台登录，返回 token |
| POST | `/api/seed` | 是 | 初始化种子数据 |
| POST | `/api/clear` | 是 | 清空所有数据 |
| POST | `/api/import` | 是 | JSON 数据导入（merge/replace） |
| PUT | `/api/schedule-update` | 是 | 修改排课（含跨月/跨学员迁移） |
| POST | `/api/schedule-add` | 是 | 新增单条排课（含字段格式与跨表关联校验、重复 ID 拒绝） |
| DELETE | `/api/schedule-delete` | 是 | 删除单条排课 |
| DELETE | `/api/student-delete` | 是 | 删除学员及其所有排课 |

## 项目结构

```
pai/
├── node-functions/              # 后端 Node Functions
│   ├── _lib/
│   │   ├── auth.js              # HMAC 签名与鉴权中间件
│   │   ├── store.js             # Blob 存储封装
│   │   └── seed-data.js         # 种子数据生成
│   └── api/
│       ├── auth.js              # 登录验证
│       ├── students.js          # 学员查询
│       ├── schedules.js         # 排课查询
│       ├── seed.js              # 种子初始化
│       ├── clear.js             # 清空数据
│       ├── import.js            # JSON 导入
│       ├── schedule-add.js      # 新增单条排课
│       ├── schedule-update.js   # 排课修改
│       ├── schedule-delete.js   # 排课删除
│       └── student-delete.js    # 学员删除（含其排课）
├── scripts/                     # 数据导入工具脚本
│   ├── seed-data.mjs
│   ├── generate-excel-template.mjs
│   ├── excel-to-json.mjs
│   ├── import-data.mjs
│   └── 排课数据导入模板.xlsx
├── src/                         # 前端源码
│   ├── api/                     # API 调用层
│   ├── components/
│   │   ├── Admin/               # 后台管理组件
│   │   └── Calendar/            # 日历视图组件
│   ├── types/                   # TypeScript 类型定义
│   ├── utils/                   # 工具函数
│   ├── App.tsx
│   └── main.tsx
├── docs/系统设计方案.md
├── index.html
├── package.json
└── vite.config.ts
```
