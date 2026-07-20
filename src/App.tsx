import { useState, useEffect } from 'react'
import { getConfig } from '@/api'
import { AdminPanel } from '@/components/Admin/AdminPanel'
import { Home } from '@/components/Home/Home'
import { PublicSearch } from '@/components/Search/PublicSearch'
import { ParentH5 } from '@/components/Parent/ParentH5'
import { getAppName, setAppName as setAppNameConfig } from '@/config'

// 页面模式：首页 / 家长端 H5 / 公开搜索页 / 后台管理
// - home：项目首页（管理员登录入口 + 项目简介）
// - parent：家长端 H5（通过专属链接 ?s=学员id 进入，手机号后4位二次校验）
// - search：公开搜索页 #search（旧首页的"类百度"布局，搜索学员 → 跳转家长端）
// - admin：后台管理（登录后进入）
type PageMode = 'home' | 'parent' | 'search' | 'admin'

// 清除 URL 中的 ?s= / ?t= 参数与 #admin / #search hash（主动返回首页时调用）
function clearNavState() {
  try {
    const url = new URL(window.location.href)
    let changed = false
    if (url.searchParams.has('s') || url.searchParams.has('t')) {
      url.searchParams.delete('s')
      url.searchParams.delete('t')
      changed = true
    }
    if (url.hash === '#admin' || url.hash.startsWith('#admin/')) {
      url.hash = ''
      changed = true
    }
    if (url.hash === '#search') {
      url.hash = ''
      changed = true
    }
    if (changed) {
      window.history.replaceState({}, '', url.toString())
    }
  } catch {
    // 忽略
  }
}

// 写入 #admin hash（进入后台时调用，子页面由 AdminPanel 内部管理）
function setAdminHash() {
  try {
    const url = new URL(window.location.href)
    if (url.hash !== '#admin' && !url.hash.startsWith('#admin/')) {
      url.hash = 'admin'
      window.history.replaceState({}, '', url.toString())
    }
  } catch {
    // 忽略
  }
}

// 写入 #search hash（进入公开搜索页时调用）
function setSearchHash() {
  try {
    const url = new URL(window.location.href)
    if (url.hash !== '#search') {
      url.hash = 'search'
      window.history.replaceState({}, '', url.toString())
    }
  } catch {
    // 忽略
  }
}

// 跳转家长端：写入 ?s=学员id 并切换到 parent 模式（由 PublicSearch 的「查看排课」触发）
function goParentWithStudentId(studentId: string, setPage: (p: PageMode) => void) {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('s', studentId)
    // 清除 #search hash，避免家长端返回时仍停留在搜索页 hash
    if (url.hash === '#search') url.hash = ''
    window.history.pushState({}, '', url.toString())
    setPage('parent')
  } catch {
    // 忽略
  }
}

export default function App() {
  // 初始页面模式：根据 URL 状态决定，避免刷新时被重置
  // - #admin 或 #admin/子页面 → 后台管理
  // - ?s= → 家长端 H5
  // - #search → 公开搜索页
  // - 其他 → 首页
  const [page, setPage] = useState<PageMode>(() => {
    try {
      const url = new URL(window.location.href)
      if (url.hash === '#admin' || url.hash.startsWith('#admin/')) return 'admin'
      if (url.searchParams.get('s')) return 'parent'
      if (url.hash === '#search') return 'search'
    } catch {
      // 忽略
    }
    return 'home'
  })
  // 项目名称（运行时从后端加载，修改后可触发重渲染）
  const [appName, setAppNameState] = useState(getAppName())

  // 启动时从后端加载系统配置（appName 等），更新全局状态与标签标题
  useEffect(() => {
    let active = true
    getConfig().then((cfg) => {
      if (!active) return
      setAppNameConfig(cfg.appName)
      setAppNameState(cfg.appName)
    })
    return () => {
      active = false
    }
  }, [])

  // 监听 popstate：浏览器前进/后退时根据 URL 重新判定页面模式
  useEffect(() => {
    const onPop = () => {
      try {
        const url = new URL(window.location.href)
        if (url.hash === '#admin' || url.hash.startsWith('#admin/')) {
          setPage('admin')
        } else if (url.searchParams.get('s')) {
          setPage('parent')
        } else if (url.hash === '#search') {
          setPage('search')
        } else {
          setPage('home')
        }
      } catch {
        setPage('home')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 家长端 H5（专属链接进入，仅展示对应学员信息）
  if (page === 'parent') {
    return <ParentH5 appName={appName} />
  }

  // 公开搜索页：搜索学员 → 跳转家长端查看排课
  if (page === 'search') {
    return (
      <PublicSearch
        appName={appName}
        onViewSchedule={(student) => {
          goParentWithStudentId(student.id, setPage)
        }}
      />
    )
  }

  // 后台管理
  if (page === 'admin') {
    return (
      <AdminPanel
        onExit={() => {
          clearNavState()
          setPage('home')
        }}
      />
    )
  }

  // 首页：管理员登录入口 + 项目简介
  return (
    <Home
      appName={appName}
      onEnterAdmin={() => {
        clearNavState()
        setAdminHash()
        setPage('admin')
      }}
      onEnterSearch={() => {
        clearNavState()
        setSearchHash()
        setPage('search')
      }}
    />
  )
}
