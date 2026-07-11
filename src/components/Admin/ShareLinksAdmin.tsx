import { useState, useMemo } from 'react'
import type { Student } from '@/types'
import { Button, EmptyState, SubPageHeader, inputClass, toast } from '@/components/ui'

interface ShareLinksAdminProps {
  students: Student[]
  onBack: () => void
}

// 分享链接管理页（家长端专属链接）
// - 链接格式：{origin}/?s=学员id
// - 家长点击链接后需输入报名时登记的手机号后 4 位验真
// - 未登记手机号的学员无法生成链接，给出提示
export function ShareLinksAdmin({ students, onBack }: ShareLinksAdminProps) {
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // 学员是否有手机号（决定能否生成链接）
  const hasPhone = (s: Student) => !!s.phone && s.phone.replace(/\D/g, '').length >= 4

  const buildLink = (s: Student) =>
    `${origin}/?s=${encodeURIComponent(s.id)}`

  // 搜索过滤：按姓名或 ID 模糊匹配
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    )
  }, [students, search])

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

  // 单条复制：只复制链接
  const handleCopy = async (s: Student) => {
    if (!hasPhone(s)) {
      toast.error('该学员未登记手机号，请先在学员档案中填写家长手机号')
      return
    }
    const text = buildLink(s)
    if (await copyToClipboard(text)) {
      setCopiedId(s.id)
      setTimeout(() => setCopiedId(null), 2000)
    } else {
      toast.error('复制失败，请手动复制')
    }
  }

  // 一键复制全部：有手机号的学员链接逐行拼接
  const handleCopyAll = async () => {
    const targets = filtered.filter(hasPhone)
    if (targets.length === 0) {
      toast.error('当前列表中没有登记手机号的学员')
      return
    }
    setBatchBusy(true)
    const lines = targets.map((s) => `${s.name}：${buildLink(s)}`)
    setBatchBusy(false)
    if (await copyToClipboard(lines.join('\n'))) {
      toast.success(`已复制 ${lines.length} 条链接`)
    } else {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <div className="min-h-full bg-background">
      <SubPageHeader title={'分享链接'} onBack={onBack} count={students.length} countLabel="人" />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 说明 */}
        <section className="card p-4">
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
            <p>
              为每位学员生成家长端专属链接。家长点击链接后需输入报名时登记的
              <strong className="text-foreground">手机号后 4 位</strong>
              进行身份验证，通过后仅可查看该学员的排课、课时余额与教师课后反馈。
            </p>
            <p>
              链接格式：<code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">域名/?s=学员id</code>
            </p>
            <p className="text-amber-600">
              ⚠️ 学员档案未填写手机号时家长无法验真，请先到「学员管理」补充家长手机号。
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
                placeholder={'搜索姓名 / ID'}
                className={inputClass}
              />
              <span className="text-xs text-muted-foreground/70 whitespace-nowrap">
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
              {batchBusy ? '复制中…' : '一键复制全部'}
            </Button>
          </div>
        </section>

        {/* 链接列表 */}
        {filtered.length > 0 ? (
          <section className="card p-0 overflow-hidden">
            {/* 桌面端表格 */}
            <table className="w-full text-sm hidden sm:table">
              <thead className="bg-background border-b border-border text-muted-foreground text-xs">
                <tr>
                  <th className="text-left py-2 px-4 font-medium">{'姓名'}</th>
                  <th className="text-left py-2 px-4 font-medium">手机号</th>
                  <th className="text-left py-2 px-4 font-medium">{'分享链接'}</th>
                  <th className="text-right py-2 px-4 font-medium">{'操作'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => {
                  const phoneOk = hasPhone(s)
                  return (
                    <tr key={s.id} className="hover:bg-muted/50">
                      <td className="py-2.5 px-4 font-medium text-foreground whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">
                        {phoneOk ? (
                          <span className="font-mono text-xs">{s.phone?.replace(/(\d{4})$/, '****$1')}</span>
                        ) : (
                          <span className="text-destructive text-xs">未登记</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs font-mono break-all">
                        {phoneOk ? buildLink(s) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleCopy(s)}
                          disabled={!phoneOk}
                          className="btn-ghost border border-border text-xs py-1 px-2.5 hover:bg-primary/10 hover:text-primary hover:border-brand-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {copiedId === s.id ? '已复制' : '复制'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 移动端卡片列表 */}
            <div className="sm:hidden divide-y divide-border">
              {filtered.map((s) => {
                const phoneOk = hasPhone(s)
                return (
                  <div key={s.id} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {s.name}
                        </div>
                        <div className="text-xs text-muted-foreground/70">
                          {phoneOk ? `手机尾号 ${s.phone?.replace(/\D/g, '').slice(-4)}` : '未登记手机号'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopy(s)}
                        disabled={!phoneOk}
                        className="btn-ghost border border-border text-xs py-1 px-2.5 hover:bg-primary/10 hover:text-primary hover:border-brand-200 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {copiedId === s.id ? '已复制' : '复制'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <EmptyState title={students.length === 0 ? '暂无学员数据' : '未匹配到学员'} />
        )}
      </main>
    </div>
  )
}
