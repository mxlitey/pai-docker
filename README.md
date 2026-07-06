<div align="center">
  <h1>📅 排课系统</h1>
  <p>基于日历视角的学员排课查询与管理系统</p>
  <p>全球边缘加速 · 无需独立服务器 · 零成本部署</p>
</div>

***

## ✨ 功能特性

- 📅 **日历视图**：月 / 周 / 日三视图切换，排课一目了然
- 🔍 **学员查询**：精确 + 模糊双模式匹配，支持键盘导航
- 📋 **排课详情**：点击卡片查看完整信息，ESC / 遮罩一键关闭
- 📢 **公告栏**：后台在线编辑，Markdown 渲染，全站同步展示
- ✅ **点名管理**：按日期批量出勤，课程→时间段两级聚合，到/缺/未三态
- 🕒 **课时统计**：剩余课时实时展示，到课自动扣减、缺勤自动回退
- 👥 **学员管理**：新增 / 编辑 / 删除，总课时调整差额自动联动
- 📚 **课程管理**：课程信息维护，颜色标签分类，默认时段记忆
- 🗂️ **排课管理**：单条 / 批量新增，跨月跨学员自动迁移
- 🔐 **后台管理**：密码登录，HMAC 签名 token，24 小时有效
- 📱 **全响应式**：手机 / 平板 / 桌面三端自适应
- 🌐 **边缘加速**：腾讯云 EdgeOne 全球 3200+ 节点，毫秒级响应

***

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript 5 + Vite 5 + TailwindCSS 3 |
| 日期 | date-fns 3 |
| 后端 | Node Functions（Edge Runtime） |
| 存储 | EdgeOne Pages Blob（分布式对象存储） |
| 部署 | 腾讯云 EdgeOne Makers |

***

## 🚀 部署流程

### 前置条件

1. 腾讯云账号（已实名认证）
2. GitHub / Gitee 代码仓库
3. 已开通 EdgeOne Makers（免费版即可）

### 步骤一：推送代码到 Git 仓库

```bash
git add .
git commit -m "排课系统"
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
| `VITE_APP_NAME` | Plain | 项目名称，显示在首页与各页标题。未设置时默认为「排课系统」 |

> 提示：以 `VITE_` 开头的变量会在构建时注入到前端产物中，修改后需重新触发部署才能生效。`ADMIN_PASSWORD` 仅后端读取，修改即时生效。
>
> 公告内容通过后台「公告管理」动态管理，存储于 EdgeOne Blob，无需环境变量配置。
>
> 页脚的 GitHub 链接硬编码为本仓库地址 `https://github.com/mxlitey/pai`，如需替换修改 [`src/config.ts`](src/config.ts) 中的 `GITHUB_URL` 即可。

### 步骤四：验证部署

平台分配预览域名，如 `https://pai-xxx.edgeone.site`。

1. 访问预览域名，确认首页正常加载（项目名称取自 `VITE_APP_NAME`，未设置时为「排课系统」）
2. 在首页搜索框输入学员姓名，自动跳转到日历页并加载该学员排课
3. 切换月 / 周 / 日视图，确认排课数据正确展示
4. 点击首页「后台管理」按钮，输入密码登录验证管理功能

### 步骤五：初始化数据

部署完成后 Blob 存储为空，正式数据请在后台通过「学员管理」「课程管理」「排课管理」逐条录入。

### 步骤六：绑定自定义域名（可选）

1. 在 Makers 控制台「项目设置」→「域名管理」
2. 添加自定义域名，如 `schedule.example.com`
3. 在域名 DNS 服务商添加 CNAME 记录指向 EdgeOne
4. 平台自动签发 SSL 证书

***

## 📡 API 一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/announcement` | 否 | 公开读取公告内容 |
| GET | `/api/students?q=` | 否 | 学员搜索（精确+模糊） |
| GET | `/api/schedules?studentId=&startDate=&endDate=` | 否 | 排课查询（按学员ID + 日期范围） |
| GET | `/api/schedules?studentName=&startDate=&endDate=` | 否 | 排课查询（按学员姓名 + 日期范围） |
| POST | `/api/auth` | 否 | 后台登录，返回 token |
| POST | `/api/announcement` | 是 | 保存公告内容 |
| GET | `/api/attendance?date=` | 是 | 获取指定日期所有排课（含出勤状态） |
| POST | `/api/attendance` | 是 | 批量设置点名，自动扣减/回退学员剩余课时 |
| PUT | `/api/schedule-update` | 是 | 修改排课（含跨月/跨学员迁移） |
| POST | `/api/schedule-add` | 是 | 新增单条排课 |
| DELETE | `/api/schedule-delete` | 是 | 删除单条排课 |
| DELETE | `/api/student-delete` | 是 | 删除学员及其所有排课 |

***

## 🗂️ 项目结构

```
pai/
├── node-functions/              # 后端 Node Functions
│   ├── _lib/
│   │   ├── auth.js              # HMAC 签名与鉴权中间件
│   │   └── store.js             # Blob 存储封装
│   └── api/                     # 各业务接口
├── src/                         # 前端源码
│   ├── api/                     # API 调用层
│   ├── components/
│   │   ├── Admin/               # 后台管理组件
│   │   ├── Announcement/        # 公告栏组件
│   │   ├── Calendar/            # 日历视图组件
│   │   └── Home/                # 简洁首页组件
│   ├── config.ts                # 环境变量集中导出
│   ├── types/                   # TypeScript 类型定义
│   └── utils/                   # 工具函数
├── index.html
├── package.json
└── vite.config.ts
```

***

## 📄 License

MIT
