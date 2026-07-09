// 全站配置集中管理
// appName 为运行时状态：初始用默认值，首屏加载后由 App.tsx 调用 getConfig 从后端更新
// 实际值存于后端 config.json（后台「系统设置」页可动态修改）

// 项目名称（运行时状态）：初始默认值，App 启动时从后端加载实际值
let appName = '排课系统'

export function getAppName(): string {
  return appName
}

export function setAppName(name: string): void {
  appName = (name || '').trim() || '排课系统'
  // 同步更新浏览器标签标题
  try {
    document.title = appName
  } catch {
    // 忽略
  }
}

// GitHub 项目链接（硬编码为本仓库地址，页脚展示 GitHub 入口）
export const GITHUB_URL = 'https://github.com/mxlitey/pai-docker'

