import { useState, useEffect } from 'react'
import { login, getToken, verifyAuth, getBootstrapStatus } from '@/api/admin'
import { inputClass } from '@/components/ui'
import { GITHUB_URL } from '@/config'

interface HomeProps {
  appName: string
  onEnterAdmin: () => void
}

// 项目首页：登录入口 + 项目简介
// - 不再提供学员搜索（家长通过专属链接进入 H5）
// - 不再展示公告板
// - 顶部语言切换，底部项目信息
// - 挂载时检测已有有效 token，有则自动进入后台（保留登录态）
export function Home({ appName, onEnterAdmin }: HomeProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  // 检测已有登录态：若 token 有效则直接进入后台，无需重新登录
  // 首次部署（admins 表为空）时自动跳转后台，由 AdminPanel 渲染超管创建引导页
  useEffect(() => {
    let cancelled = false
    async function checkSession() {
      try {
        const { bootstrap } = await getBootstrapStatus()
        if (!cancelled && bootstrap) {
          onEnterAdmin()
          return
        }
      } catch {
        // 引导状态检测失败不阻塞，继续走登录态校验
      }
      if (!getToken()) {
        if (!cancelled) setChecking(false)
        return
      }
      try {
        const result = await verifyAuth()
        if (!cancelled && result.code === 0 && result.data?.valid) {
          onEnterAdmin()
          return
        }
      } catch {
        // token 无效或网络错误，留在登录页
      }
      if (!cancelled) setChecking(false)
    }
    checkSession()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username) {
      setError('请输入用户名')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await login(username, password)
      if (result.code === 0) {
        onEnterAdmin()
      } else if (result.bootstrap) {
        // 系统未初始化，进入后台渲染引导页
        onEnterAdmin()
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError('请求失败' + '：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 简介卡片数据
  const features: { title: string; desc: string; icon: React.ReactNode }[] = [
    {
      title: '排课点名',
      desc: '批量排课、日历视图、一键点名扣减课时',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      ),
    },
    {
      title: '报名课时',
      desc: '购课赠课、剩余课时、续费预警一目了然',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      ),
    },
    {
      title: '数据报表',
      desc: '营收、课时、出勤、教师绩效多维统计',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      ),
    },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-semibold text-slate-800">{appName}</span>
          </div>
        </div>
      </header>

      {/* 主体：左侧简介 + 右侧登录 */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10">
        {checking ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-slate-200 border-t-brand-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-400">正在检查登录状态…</p>
          </div>
        ) : (
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* 左：项目简介 */}
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 tracking-tight mb-3">
              {appName}
            </h1>
            <p className="text-slate-500 leading-relaxed mb-6">
              面向培训机构的排课与教务管理系统。覆盖排课点名、报名课时、结转与数据报表，
              支持细粒度权限分配与家长端专属查询。
            </p>
            <div className="grid grid-cols-2 gap-3">
              {features.map((f) => (
                <div key={f.title} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="w-8 h-8 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {f.icon}
                    </svg>
                  </div>
                  <div className="text-sm font-medium text-slate-800 mb-0.5">{f.title}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 右：登录 */}
          <div className="w-full max-w-sm mx-auto">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-white mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-800">{'管理员登录'}</h2>
              <p className="text-sm text-slate-400 mt-1">管理员 / 教师登录后台</p>
            </div>

            <form onSubmit={handleSubmit} className="card p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {'用户名'}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError('') }}
                  placeholder={'请输入用户名'}
                  autoFocus
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {'密码'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder={'请输入密码'}
                  className={inputClass}
                />
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={loading ? 'btn-primary w-full opacity-70' : 'btn-primary w-full'}
              >
                {loading ? '登录中…' : '登录'}
              </button>
            </form>

            <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
              家长请通过老师发送的专属链接查看排课
            </p>
          </div>
        </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        <span>{appName}</span>
        {GITHUB_URL && (
          <>
            <span className="mx-2">·</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-brand-500 transition-colors inline-flex items-center gap-1 align-middle"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.72-4.04-1.59-4.04-1.59-.55-1.38-1.34-1.75-1.34-1.75-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.23 1.85 1.23 1.07 1.8 2.81 1.28 3.5.98.11-.77.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.23-3.17-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.21a11.6 11.6 0 016 0c2.3-1.53 3.3-1.21 3.3-1.21.65 1.65.24 2.87.12 3.17.77.83 1.23 1.88 1.23 3.17 0 4.53-2.81 5.52-5.49 5.81.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .32.21.7.82.58A12.04 12.04 0 0024 12.29C24 5.78 18.63.5 12 .5z" />
              </svg>
              GitHub
            </a>
          </>
        )}
      </footer>
    </div>
  )
}
