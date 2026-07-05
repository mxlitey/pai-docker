// 全站配置集中管理
// Vite 仅向前端暴露以 VITE_ 前缀开头的环境变量
// 在 EdgeOne Makers 控制台「环境变量与密钥」中配置即可生效

// 项目名称，如「排课日历系统」「XX培训排课」等
export const APP_NAME =
  import.meta.env.VITE_APP_NAME?.toString().trim() || '排课日历系统'

// GitHub 项目链接（硬编码为本仓库地址，页脚展示 GitHub 入口）
export const GITHUB_URL = 'https://github.com/mxlitey/pai'

// 页脚文字
export const FOOTER_TEXT = '排课系统'
