import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Student } from '@/types'
import { generateShareLink } from '@/api/admin'
import { Button, EmptyState, SubPageHeader, inputClass, toast } from '@/components/ui'

interface ShareLinksAdminProps {
  students: Student[]
  onBack: () => void
}

// 分享链接管理页（家长端专属链接）
// - 链接格式：{origin}/?s=学员id&t=token
// - token 由后端用 secret 签发，内含学员手机号后4位；家长进入 H5 后需输入手机号后4位二次校验
// - 按需生成：点击「复制链接」时向后端请求 token，避免一次性生成大量 token
// - 未登记手机号的学员无法生成链接，给出提示
export function ShareLinksAdmin({ students, onBack }: ShareLinksAdminProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  // 已生成的 token 缓存：studentId -> token（避免重复请求）
  const [tokenCache, setTokenCache] = useState<Record<string, string>>({})
  // 正在生成中的 studentId 集合
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // 学员是否有手机号（决定能否生成链接）
  const hasPhone = (s: Student) => !!s.phone && s.phone.replace(/\D/g, '').length >= 4

  const buildLink = (s: Student, token: string) =>
    `${origin}/?s=${encodeURIComponent(s.id)}&t=${encodeURIComponent(token)}`

  // 搜索过滤：按姓名或 ID 模糊匹配
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    )
  }, [students, search])

  // 为单个学员生成 token（带缓存）
  async function ensureToken(s: Student): Promise<string | null> {
    if (tokenCache[s.id]) return tokenCache[s.id]
    setGenerating((prev) => new Set(prev).add(s.id))
    try {
      const result = await generateShareLink(s.id)
      if (result.code === 0 && result.data?.token) {
        setTokenCache((prev) => ({ ...prev, [s.id]: result.data.token }))
        return result.data.token
      }
      toast.error(result.message || '生成失败')
      return null
    } catch (e) {
      toast.error((e as Error).message || '生成失败')
      return null
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
    }
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return fallbackCopy(text)
    }
  }

  function fallbackCopy(text: string): boolean {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }

  // 单条复制：按需生成 token + 复制
  const handleCopy = async (s: Student) => {
    if (!hasPhone(s)) {
      toast.error('该学员未登记手机号，请先在学员档案中填写家长手机号')
      return
    }
    const token = await ensureToken(s)
    if (!token) return
    const text = `${s.name}：${buildLink(s, token)}`
    if (await copyToClipboard(text)) {
      setCopiedId(s.id)
      setTimeout(() => setCopiedId(null), 2000)
    } else {
      toast.error('复制失败，请手动复制')
    }
  }

  // 一键复制全部：依次为有手机号的学员生成 token 并拼接
  const handleCopyAll = async () => {
    const targets = filtered.filter(hasPhone)
    if (targets.length === 0) {
      toast.error('当前列表中没有登记手机号的学员')
      return
    }
    setBatchBusy(true)
    const lines: string[] = []
    for (const s of targets) {
      const token = await ensureToken(s)
      if (token) lines.push(`${s.name}：${buildLink(s, token)}`)
    }
    setBatchBusy(false)
    if (lines.length === 0) {
      toast.error('生成失败，请稍后重试')
      return
    }
    if (await copyToClipboard(lines.join('\n'))) {
      toast.success(`已复制 ${lines.length} 条链接`)
    } else {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={t('shareLinks.title')} onBack={onBack} count={students.length} countLabel="人" />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 说明 */}
        <section className="card p-4">
          <div className="text-xs text-slate-500 leading-relaxed space-y-1.5">
            <p>
              为每位学员生成家长端专属链接。家长点击链接后需输入报名时登记的
              <strong className="text-slate-700">手机号后 4 位</strong>
              进行身份验证，通过后仅可查看该学员的排课、课时余额与教师课后反馈。
            </p>
            <p>
              链接格式：<code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">域名/?s=学员id&amp;t=专属token</code>
              <span className="ml-2 text-slate-400">链接长期有效，更换手机号后需重新生成</span>
            </p>
            <p className="text-amber-600">
              ⚠️ 学员档案未填写手机号时无法生成链接，请先到「学员管理」补充家长手机号。
            </p>
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
                placeholder={t('shareLinks.searchPlaceholder')}
                className={inputClass}
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">
                共 {filtered.length} 人
              </span>
            </div>
            <Button
              variant="primary"
              onClick={handleCopyAll}
              loading={batchBusy}
              disabled={filtered.length === 0}
              className="whitespace-nowrap"
            >
              {batchBusy ? '生成中…' : t('shareLinks.copyAll')}
            </Button>
          </div>
        </section>

        {/* 链接列表 */}
        {filtered.length > 0 ? (
          <section className="card p-0 overflow-hidden">
            {/* 桌面端表格 */}
            <table className="w-full text-sm hidden sm:table">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <tr>
                  <th className="text-left py-2 px-4 font-medium">{t('student.name')}</th>
                  <th className="text-left py-2 px-4 font-medium">手机号</th>
                  <th className="text-left py-2 px-4 font-medium">{t('shareLinks.title')}</th>
                  <th className="text-right py-2 px-4 font-medium">{t('common.operation')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const phoneOk = hasPhone(s)
                  const token = tokenCache[s.id]
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                        {phoneOk ? (
                          <span className="font-mono text-xs">{s.phone?.replace(/(\d{4})$/, '****$1')}</span>
                        ) : (
                          <span className="text-rose-500 text-xs">未登记</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 text-xs font-mono break-all">
                        {token ? buildLink(s, token) : (phoneOk ? '点击右侧按钮生成' : '—')}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleCopy(s)}
                          disabled={!phoneOk || generating.has(s.id)}
                          className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {generating.has(s.id) ? '生成中…' : copiedId === s.id ? t('shareLinks.copied') : t('shareLinks.copy')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 移动端卡片列表 */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filtered.map((s) => {
                const phoneOk = hasPhone(s)
                const token = tokenCache[s.id]
                return (
                  <div key={s.id} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {s.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {phoneOk ? `手机尾号 ${s.phone?.replace(/\D/g, '').slice(-4)}` : '未登记手机号'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopy(s)}
                        disabled={!phoneOk || generating.has(s.id)}
                        className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {generating.has(s.id) ? '生成中…' : copiedId === s.id ? t('shareLinks.copied') : t('shareLinks.copy')}
                      </button>
                    </div>
                    {token && (
                      <div className="text-xs text-slate-500 font-mono break-all bg-slate-50 rounded p-2">
                        {buildLink(s, token)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <EmptyState title={students.length === 0 ? t('shareLinks.noStudents') : t('shareLinks.noMatch')} />
        )}
      </main>
    </div>
  )
}
