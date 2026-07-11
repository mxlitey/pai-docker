// 家长端 H5：通过专属链接进入，手机号后4位二次校验后查看对应学员信息
// - 移动端优化布局
// - 仅展示该学员的排课、课时余额、教师课后反馈
// - 支持列表/日历两种查看方式
// - 无返回首页、无搜索学员功能
import { useEffect, useState } from 'react'
import {
  getParentAccessHint,
  verifyParentAccess,
  type ParentAccessData,
} from '@/api'
import { inputClass } from '@/components/ui'
import { CalendarToolbar } from '../Calendar/CalendarToolbar'
import { MonthView } from '../Calendar/MonthView'
import { WeekView } from '../Calendar/WeekView'
import { DayView } from '../Calendar/DayView'
import { ScheduleDetail } from '../ScheduleDetail'
import type { Schedule, Feedback, ViewMode } from '@/types'
import { AlertTriangle, Lock, Loader2, Star } from 'lucide-react'

type Phase = 'loading' | 'verify' | 'verified' | 'error'

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
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-brand-100 text-primary flex items-center justify-center font-semibold">
              {data.student.name.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm">{data.student.name}</div>
              {data.student.grade && (
                <div className="text-xs text-muted-foreground/70">{data.student.grade}</div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* 学员信息概览 */}
        <section className="card p-4 bg-gradient-to-r from-brand-50 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-brand-100 text-primary flex items-center justify-center font-semibold text-base">
                {data.student.name.charAt(0)}
              </div>
              <div>
                <div className="font-semibold text-foreground">{data.student.name}</div>
                <div className="text-xs text-muted-foreground/70">
                  {[
                    data.student.grade,
                    data.student.parentName,
                  ].filter(Boolean).join(' · ') || '学员'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground/70">总排课</div>
              <div className="text-lg font-semibold text-primary">{data.schedules.length}</div>
            </div>
          </div>
          {/* 课时余额速览 */}
          {data.enrollments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-brand-100/60 space-y-1.5">
              {data.enrollments.map((e, i) => (
                <div key={`${e.courseId}-${i}`} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{e.courseName || `课程 ${e.courseId.slice(-6)}`}</span>
                  <span className={`font-medium ${e.remainingHours > 0 ? 'text-primary' : 'text-muted-foreground/70'}`}>
                    剩余 {e.remainingHours} 课时
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

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
