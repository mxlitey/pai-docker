// 家长端 H5：通过专属链接进入，手机号后4位二次校验后查看对应学员信息
// - 移动端优化布局
// - 仅展示该学员的排课、课时余额、教师课后反馈
// - 支持列表/日历两种查看方式
// - 无返回首页、无搜索学员功能
import { useEffect, useRef, useState } from 'react'
import {
  getParentAccessHint,
  verifyParentAccess,
  type ParentAccessData,
  type ParentAnnouncement,
} from '@/api'
import { inputClass } from '@/components/ui'
import { CalendarToolbar } from '../Calendar/CalendarToolbar'
import { MonthView } from '../Calendar/MonthView'
import { WeekView } from '../Calendar/WeekView'
import { DayView } from '../Calendar/DayView'
import { ScheduleDetail } from '../ScheduleDetail'
import type { Schedule, Feedback, ViewMode } from '@/types'
import { AlertTriangle, Lock, Loader2, Star, Megaphone } from 'lucide-react'

type Phase = 'loading' | 'verify' | 'verified' | 'error'

// 家长端免验证缓存：验证通过后将手机尾号存入 localStorage，下次打开链接自动登录
// key 按学员 ID 隔离，避免不同学员串数据；仅存手机尾号（4位），无敏感信息
function parentTokenKey(studentId: string) {
  return `parent_access_${studentId}`
}
function loadCachedSuffix(studentId: string): string {
  try {
    return localStorage.getItem(parentTokenKey(studentId)) || ''
  } catch {
    return ''
  }
}
function cacheSuffix(studentId: string, suffix: string) {
  try {
    localStorage.setItem(parentTokenKey(studentId), suffix)
  } catch {
    // 忽略写入失败
  }
}

// 公告已读记录：按学员 ID 隔离，缓存最近一次已读公告的 updatedAt
// 后台更新公告后 updatedAt 变化，家长再次进入会重新弹出公告板
function parentAnnouncementReadKey(studentId: string) {
  return `parent_announcement_read_${studentId}`
}
function loadReadAnnouncementUpdatedAt(studentId: string): string {
  try {
    return localStorage.getItem(parentAnnouncementReadKey(studentId)) || ''
  } catch {
    return ''
  }
}
function cacheReadAnnouncementUpdatedAt(studentId: string, updatedAt: string) {
  try {
    localStorage.setItem(parentAnnouncementReadKey(studentId), updatedAt)
  } catch {
    // 忽略写入失败
  }
}

function renderStars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

export function ParentH5({ appName }: { appName: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [studentName, setStudentName] = useState('')
  const [phoneHint, setPhoneHint] = useState('')
  const [phoneSuffix, setPhoneSuffix] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [data, setData] = useState<ParentAccessData | null>(null)
  // 公告板弹窗：验证通过后若有未读公告则弹出
  const [showAnnouncement, setShowAnnouncement] = useState(false)

  // 从 URL 读取 s 参数（学员 ID）
  const params = new URLSearchParams(window.location.search)
  const studentId = params.get('s') || ''

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!studentId) {
        if (!cancelled) {
          setErrorMsg('链接缺少必要参数，请通过老师发送的专属链接访问')
          setPhase('error')
        }
        return
      }
      // 1) 优先尝试 localStorage 缓存的手机尾号，命中则直接免验证登录
      const cached = loadCachedSuffix(studentId)
      if (cached.length === 4) {
        try {
          const result = await verifyParentAccess(studentId, cached)
          if (cancelled) return
          setData(result)
          setStudentName(result.student.name)
          setPhase('verified')
          return
        } catch {
          // 缓存失效（手机号已变更等），回退到手动验证流程
        }
      }
      // 2) 无缓存或缓存失效，走正常验证流程：先拉取脱敏提示
      try {
        const hint = await getParentAccessHint(studentId)
        if (cancelled) return
        setStudentName(hint.studentName)
        setPhoneHint(hint.phoneHint)
        setPhase('verify')
      } catch (e) {
        if (!cancelled) {
          setErrorMsg((e as Error).message || '链接无效或已失效')
          setPhase('error')
        }
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 验证通过后：若公告有内容且 updatedAt 与本地缓存不一致，弹出公告板
  useEffect(() => {
    if (phase !== 'verified' || !data) return
    const ann = data.announcement
    if (!ann || !ann.content || !ann.content.trim()) return
    const readUpdatedAt = loadReadAnnouncementUpdatedAt(studentId)
    if (ann.updatedAt && ann.updatedAt === readUpdatedAt) return
    setShowAnnouncement(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, data])

  const handleCloseAnnouncement = () => {
    if (data?.announcement?.updatedAt) {
      cacheReadAnnouncementUpdatedAt(studentId, data.announcement.updatedAt)
    }
    setShowAnnouncement(false)
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phoneSuffix.length !== 4) {
      setErrorMsg('请输入 4 位手机号尾数')
      return
    }
    setVerifying(true)
    setErrorMsg('')
    try {
      const result = await verifyParentAccess(studentId, phoneSuffix)
      setData(result)
      setStudentName(result.student.name)
      // 验证通过：缓存手机尾号，下次打开链接免验证
      cacheSuffix(studentId, phoneSuffix)
      setPhase('verified')
    } catch (e) {
      setErrorMsg((e as Error).message || '校验失败')
    } finally {
      setVerifying(false)
    }
  }

  // ===== 错误页 =====
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-rose-100 text-destructive flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <p className="text-sm text-muted-foreground mb-1">无法访问</p>
        <p className="text-xs text-muted-foreground/70 max-w-xs leading-relaxed">{errorMsg}</p>
        <p className="text-xs text-muted-foreground/70 mt-4">请联系老师获取新的专属链接</p>
      </div>
    )
  }

  // ===== 手机号校验页 =====
  if (phase === 'verify') {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="bg-background border-b border-border py-3 px-4 flex items-center justify-between">
          <span className="font-semibold text-foreground text-sm">{appName}</span>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Lock className="w-7 h-7" />
              </div>
              <h1 className="text-lg font-semibold text-foreground">身份验证</h1>
              <p className="text-sm text-muted-foreground/70 mt-1">
                学员：<span className="text-muted-foreground font-medium">{studentName}</span>
              </p>
            </div>

            <form onSubmit={handleVerify} className="card p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {phoneHint}
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={phoneSuffix}
                  onChange={(e) => {
                    setPhoneSuffix(e.target.value.replace(/\D/g, '').slice(0, 4))
                    setErrorMsg('')
                  }}
                  placeholder="• • • •"
                  autoFocus
                  className={`${inputClass} text-center tracking-[0.5em] text-lg font-semibold`}
                />
              </div>

              {errorMsg && (
                <div className="bg-destructive/10 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || phoneSuffix.length !== 4}
                className={verifying || phoneSuffix.length !== 4 ? 'btn-primary w-full opacity-50' : 'btn-primary w-full'}
              >
                {verifying ? '验证中…' : '查看排课'}
              </button>
            </form>

            <p className="text-xs text-muted-foreground/70 text-center mt-4 leading-relaxed">
              仅可查看本学员信息，如需修改请联系老师
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ===== 加载中 =====
  if (phase === 'loading' || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="animate-spin w-4 h-4 text-primary" />
          {'加载中…'}
        </div>
      </div>
    )
  }

  // ===== 已验证：学员信息主页 =====
  // 学员概览信息（姓名/年级 + 课时余额 + 总排课）统一收纳到页眉，
  // 避免日历顶部重复展示学员信息；电脑端页眉较宽，信息左对齐连续展示而非一左一右割裂
  return (
    <div className="min-h-screen bg-background">
      {showAnnouncement && data?.announcement && (
        <AnnouncementPopup
          announcement={data.announcement}
          onClose={handleCloseAnnouncement}
        />
      )}
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          {/* 第一行：头像 + 姓名 + 关键统计 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-brand-100 text-primary flex items-center justify-center font-semibold text-base flex-shrink-0">
              {data.student.name.charAt(0)}
            </div>
            <div className="flex-shrink-0">
              <div className="font-semibold text-foreground text-sm">{data.student.name}</div>
              {data.student.grade && (
                <div className="text-xs text-muted-foreground/70">{data.student.grade}</div>
              )}
            </div>
            {/* 统计信息：电脑端跟在姓名后面，手机端靠右 */}
            <div className="flex items-center gap-4 ml-auto">
              <div className="text-right">
                <div className="text-xs text-muted-foreground/70">总排课</div>
                <div className="text-sm font-semibold text-primary">{data.schedules.length}</div>
              </div>
              {data.enrollments.length > 0 && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground/70">课程数</div>
                  <div className="text-sm font-semibold text-primary">{data.enrollments.length}</div>
                </div>
              )}
            </div>
          </div>
          {/* 第二行：课时余额（横向滚动，手机端不拥挤） */}
          {data.enrollments.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-4 overflow-x-auto no-scrollbar">
              {data.enrollments.map((e, i) => (
                <div key={`${e.courseId}-${i}`} className="flex items-center gap-1.5 text-xs whitespace-nowrap flex-shrink-0">
                  <span className="text-muted-foreground">{e.courseName || `课程 ${e.courseId.slice(-6)}`}</span>
                  <span className={`font-medium ${e.remainingHours > 0 ? 'text-primary' : 'text-muted-foreground/70'}`}>
                    剩 {e.remainingHours} 课时
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* 日历视图 */}
        <ParentCalendar schedules={data.schedules} />

        {/* 教师课后反馈 */}
        {data.feedback.length > 0 && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-500" />
              教师课后反馈（{data.feedback.length}）
            </h2>
            <div className="space-y-3">
              {data.feedback.map((fb: Feedback) => (
                <div key={fb.id} className="border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{fb.date || '—'}</span>
                    <span className="text-amber-500 text-xs">{renderStars(fb.rating)}</span>
                  </div>
                  {fb.content && (
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{fb.content}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground/40 text-center py-2">
          如需调整排课或信息有误，请联系老师
        </p>
      </main>
    </div>
  )
}

// ============ 家长端日历视图（复用原日历组件） ============
// 月/周/日视图切换 + 导航，点击排课卡片弹出详情
function ParentCalendar({ schedules }: { schedules: Schedule[] }) {
  const [view, setView] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)

  // 导航：上/下/今天
  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date())
      return
    }
    const delta = direction === 'next' ? 1 : -1
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1))
    } else if (view === 'week') {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + delta * 7)
      setCurrentDate(d)
    } else {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + delta)
      setCurrentDate(d)
    }
  }

  return (
    <div className="space-y-3">
      <CalendarToolbar
        currentDate={currentDate}
        view={view}
        onNavigate={handleNavigate}
        onViewChange={setView}
      />
      {view === 'month' && (
        <MonthView
          currentDate={currentDate}
          schedules={schedules}
          onScheduleClick={setSelectedSchedule}
        />
      )}
      {view === 'week' && (
        <WeekView
          currentDate={currentDate}
          schedules={schedules}
          onScheduleClick={setSelectedSchedule}
        />
      )}
      {view === 'day' && (
        <DayView
          currentDate={currentDate}
          schedules={schedules}
          onScheduleClick={setSelectedSchedule}
        />
      )}
      <ScheduleDetail
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
      />
    </div>
  )
}

// ============ 公告板弹窗 ============
// 后台更新公告后，家长再次进入家长端弹出公告板
// 需滚动阅读完全部内容后才可关闭，关闭后缓存 updatedAt，下次不再弹出（除非再次更新）
function AnnouncementPopup({
  announcement,
  onClose,
}: {
  announcement: ParentAnnouncement
  onClose: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasRead, setHasRead] = useState(false)

  // 检查是否已滚动到底部（或内容本身不超出则视为已读）
  const checkRead = () => {
    const el = scrollRef.current
    if (!el) {
      setHasRead(true)
      return
    }
    // 内容未溢出：无需滚动即可阅读完
    if (el.scrollHeight - el.clientHeight <= 4) {
      setHasRead(true)
      return
    }
    // 滚动到底部（容差 8px）视为阅读完
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setHasRead(true)
    }
  }

  useEffect(() => {
    // 初始挂载时检查一次（内容短则直接可关闭）
    checkRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 格式化更新时间
  const formatUpdatedAt = (ts: string) => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      if (isNaN(d.getTime())) return ts
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${y}-${m}-${day} ${hh}:${mm}`
    } catch {
      return ts
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="公告板"
    >
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in-0 zoom-in-95 duration-150">
        {/* 头部：禁止关闭，需阅读完后从底部按钮关闭 */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base text-foreground">公告板</h3>
            {announcement.updatedAt && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                更新于 {formatUpdatedAt(announcement.updatedAt)}
              </p>
            )}
          </div>
        </div>

        {/* 内容区：可滚动，需滚动到底部才视为已读 */}
        <div
          ref={scrollRef}
          onScroll={checkRead}
          className="px-5 py-4 overflow-y-auto flex-1"
        >
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {announcement.content}
          </div>
        </div>

        {/* 底部：阅读完后才可关闭 */}
        <div className="px-5 py-3 bg-muted/40 border-t border-border flex flex-col items-center gap-1.5 flex-shrink-0">
          {!hasRead && (
            <p className="text-xs text-muted-foreground/70">
              请向下滚动阅读完整公告内容后关闭
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={!hasRead}
            className={
              hasRead
                ? 'btn-primary w-full'
                : 'btn-primary w-full opacity-50 cursor-not-allowed'
            }
          >
            {hasRead ? '我已阅读，关闭公告' : '请先阅读完整公告'}
          </button>
        </div>
      </div>
    </div>
  )
}
