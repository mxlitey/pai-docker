import { useState, useMemo } from 'react'
import type { Student } from '@/types'

interface ShareLinksAdminProps {
  students: Student[]
  onBack: () => void
}

// 分享链接管理页
// - 遍历所有学员，为每个学员生成专属排课查看链接
// - 链接格式：{origin}/?s=学员id&n=学员名字
// - 支持按姓名/ID 搜索过滤
// - 支持单条复制、一键复制全部
export function ShareLinksAdmin({ students, onBack }: ShareLinksAdminProps) {
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  // 站点根地址：生产环境自动获取当前域名，无需配置
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // 为学员生成专属链接
  const buildLink = (s: Student) =>
    `${origin}/?s=${encodeURIComponent(s.id)}&n=${encodeURIComponent(s.name)}`

  // 搜索过滤：按姓名或 ID 模糊匹配
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    )
  }, [students, search])

  // 单条复制
  const handleCopy = async (s: Student) => {
    const link = buildLink(s)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(s.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // clipboard API 不可用时回退到选中提示
      fallbackCopy(link)
      setCopiedId(s.id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  // 一键复制全部（按行格式：姓名：链接）
  const handleCopyAll = async () => {
    const text = filtered.map((s) => `${s.name}：${buildLink(s)}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    } catch {
      fallbackCopy(text)
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    }
  }

  // 回退复制方案：创建临时 textarea 触发 execCommand
  const fallbackCopy = (text: string) => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {
      // 忽略
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回后台
            </button>
            <span className="text-slate-300">/</span>
            <h1 className="text-base font-semibold text-slate-800">分享链接</h1>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">查看和生成分享链接</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 说明 */}
        <section className="card p-4">
          <div className="text-xs text-slate-500 leading-relaxed">
            为每位学员生成专属排课查看链接，家长点击即可直接查看该学员的排课日历，无需登录或搜索。
            链接格式：<code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">域名/?s=学员id&amp;n=学员名字</code>
          </div>
        </section>

        {/* 搜索 + 批量操作 */}
        <section className="card p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索姓名 / ID"
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">
                共 {filtered.length} 人
              </span>
            </div>
            <button
              onClick={handleCopyAll}
              disabled={filtered.length === 0}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50 whitespace-nowrap"
            >
              {copiedAll ? '已复制全部' : '一键复制全部'}
            </button>
          </div>
        </section>

        {/* 链接列表 */}
        {filtered.length > 0 ? (
          <section className="card p-0 overflow-hidden">
            {/* 桌面端表格 */}
            <table className="w-full text-sm hidden sm:table">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <tr>
                  <th className="text-left py-2 px-4 font-medium">姓名</th>
                  <th className="text-left py-2 px-4 font-medium">ID</th>
                  <th className="text-left py-2 px-4 font-medium">分享链接</th>
                  <th className="text-right py-2 px-4 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {s.name}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 font-mono text-xs">
                      {s.id}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 text-xs font-mono break-all">
                      {buildLink(s)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleCopy(s)}
                        className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200"
                      >
                        {copiedId === s.id ? '已复制' : '复制'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 移动端卡片列表 */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filtered.map((s) => (
                <div key={s.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {s.name}
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate">
                        {s.id}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopy(s)}
                      className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 flex-shrink-0"
                    >
                      {copiedId === s.id ? '已复制' : '复制'}
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 font-mono break-all bg-slate-50 rounded p-2">
                    {buildLink(s)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="card p-10 text-center text-slate-400 text-sm">
            {students.length === 0 ? '暂无学员数据' : '未匹配到学员'}
          </div>
        )}
      </main>
    </div>
  )
}
