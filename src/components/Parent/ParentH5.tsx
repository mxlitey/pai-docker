// 家长端 H5：通过专属链接进入，手机号后4位二次校验后查看对应学员信息
// - 移动端优化布局
// - 仅展示该学员的排课、课时余额、教师课后反馈
// - 支持列表/日历两种查看方式
// - 无返回首页、无搜索学员功能
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getParentAccessHint,
  verifyParentAccess,
  type ParentAccessData,
} from '@/api'
import { LanguageSwitcher, inputClass } from '@/components/ui'
import type { Schedule, Feedback } from '@/types'
import { cn } from '@/utils/cn'

type Phase = 'loading' | 'verify' | 'verified' | 'error'

interface GroupedSchedules {
  date: string
  items: Schedule[]
}

// 按日期分组排课
function groupByDate(schedules: Schedule[]): GroupedSchedules[] {
  const map = new Map<string, Schedule[]>()
  for (const s of schedules) {
    const arr = map.get(s.date) || []
    arr.push(s)
    map.set(s.date, arr)
  }
  return Array.from(map.entries())
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function renderStars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

// 把 yyyy-MM-dd 格式化为易读的「M月D日 周X」
function formatDateCN(date: string): string {
  try {
    const d = new Date(date + 'T00:00:00')
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
  } catch {
    return date
  }
}

export function ParentH5({ appName }: { appName: string }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [studentName, setStudentName] = useState('')
  const [phoneHint, setPhoneHint] = useState('')
  const [phoneSuffix, setPhoneSuffix] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [data, setData] = useState<ParentAccessData | null>(null)
  const [tab, setTab] = useState<'list' | 'calendar'>('list')

  // 从 URL 读取 s / t 参数
  const params = new URLSearchParams(window.location.search)
  const studentId = params.get('s') || ''
  const token = params.get('t') || ''

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!studentId || !token) {
        if (!cancelled) {
          setErrorMsg('链接缺少必要参数，请通过老师发送的专属链接访问')
          setPhase('error')
        }
        return
      }
      try {
        const hint = await getParentAccessHint(studentId, token)
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
      const result = await verifyParentAccess(studentId, token, phoneSuffix)
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm text-slate-600 mb-1">无法访问</p>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{errorMsg}</p>
        <p className="text-xs text-slate-400 mt-4">请联系老师获取新的专属链接</p>
      </div>
    )
  }

  // ===== 手机号校验页 =====
  if (phase === 'verify') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <header className="bg-white border-b border-slate-200 py-3 px-4 flex items-center justify-between">
          <span className="font-semibold text-slate-800 text-sm">{appName}</span>
          <LanguageSwitcher compact />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-slate-800">身份验证</h1>
              <p className="text-sm text-slate-400 mt-1">
                学员：<span className="text-slate-600 font-medium">{studentName}</span>
              </p>
            </div>

            <form onSubmit={handleVerify} className="card p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
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
                <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
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

            <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <svg className="animate-spin w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('common.loading')}
        </div>
      </div>
    )
  }

  // ===== 已验证：学员信息主页 =====
  const groups = groupByDate(data.schedules)
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = groups.filter((g) => g.date >= todayStr)
  const past = groups.filter((g) => g.date < todayStr).reverse()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-semibold">
              {data.student.name.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-sm">{data.student.name}</div>
              {data.student.grade && (
                <div className="text-xs text-slate-400">{data.student.grade}</div>
              )}
            </div>
          </div>
          <LanguageSwitcher compact />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* 列表/日历 切换 */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 w-full">
          <button
            onClick={() => setTab('list')}
            className={cn(
              'flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-all',
              tab === 'list' ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-600',
            )}
          >
            列表
          </button>
          <button
            onClick={() => setTab('calendar')}
            className={cn(
              'flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-all',
              tab === 'calendar' ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-600',
            )}
          >
            日历
          </button>
        </div>

        {tab === 'calendar' ? (
          <ParentCalendar schedules={data.schedules} />
        ) : (
          <>
        {/* 课时余额 */}
        {data.enrollments.length > 0 && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              课时余额
            </h2>
            <div className="space-y-2">
              {data.enrollments.map((e, i) => (
                <div key={`${e.courseId}-${i}`} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-slate-600">
                    {e.courseName || `课程 ${e.courseId.slice(-6)}`}
                  </span>
                  <span className={`font-semibold ${e.remainingHours > 0 ? 'text-brand-600' : 'text-slate-400'}`}>
                    剩余 {e.remainingHours} 课时
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 即将到来的排课 */}
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            即将上课（{upcoming.length}）
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">近期暂无排课</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((g) => (
                <ScheduleGroup key={g.date} group={g} highlight />
              ))}
            </div>
          )}
        </section>

        {/* 历史排课 */}
        {past.length > 0 && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              历史排课（{past.length}）
            </h2>
            <div className="space-y-2">
              {past.slice(0, 20).map((g) => (
                <ScheduleGroup key={g.date} group={g} />
              ))}
            </div>
          </section>
        )}

        {/* 教师课后反馈 */}
        {data.feedback.length > 0 && (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              教师课后反馈（{data.feedback.length}）
            </h2>
            <div className="space-y-3">
              {data.feedback.map((fb: Feedback) => (
                <div key={fb.id} className="border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">{fb.date || '—'}</span>
                    <span className="text-amber-500 text-xs">{renderStars(fb.rating)}</span>
                  </div>
                  {fb.content && (
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{fb.content}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-slate-300 text-center py-2">
          如需调整排课或信息有误，请联系老师
        </p>
          </>
        )}
      </main>
    </div>
  )
}

// 单日排课分组渲染
function ScheduleGroup({ group, highlight = false }: { group: GroupedSchedules; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-brand-50/50 border border-brand-100' : 'bg-slate-50'}`}>
      <div className="text-xs font-medium text-slate-500 mb-2">{formatDateCN(group.date)}</div>
      <div className="space-y-1.5">
        {group.items.map((s) => (
          <div key={s.id} className="flex items-start gap-2 text-sm">
            <span className="text-slate-400 text-xs font-mono mt-0.5 whitespace-nowrap">
              {s.startTime || '--:--'}-{s.endTime || '--:--'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-slate-700 truncate">{s.courseName}</div>
              {(s.teacher || s.location) && (
                <div className="text-xs text-slate-400 truncate">
                  {[s.teacher, s.location].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ 家长端日历视图（移动端月视图） ============
// 显示当月排课，可切换月份；点击有课的日期展开当天详情
const CAL_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function ParentCalendar({ schedules }: { schedules: Schedule[] }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 按日期索引排课
  const scheduleMap = useMemo(() => {
    const map = new Map<string, Schedule[]>()
    for (const s of schedules) {
      const arr = map.get(s.date) || []
      arr.push(s)
      map.set(s.date, arr)
    }
    // 每天内按时间排序
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    }
    return map
  }, [schedules])

  // 计算月视图网格单元格（6行7列）
  const cells = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    // 周一为一周起点：getDay() 周日=0，需转为 6
    let startWeekday = firstDay.getDay() - 1
    if (startWeekday < 0) startWeekday = 6
    const startDate = new Date(year, month, 1 - startWeekday)
    const todayStr = new Date().toISOString().slice(0, 10)
    const result: { date: Date; dateStr: string; isCurrentMonth: boolean; isToday: boolean; count: number }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      result.push({
        date: d,
        dateStr,
        isCurrentMonth: d.getMonth() === month,
        isToday: dateStr === todayStr,
        count: scheduleMap.get(dateStr)?.length || 0,
      })
    }
    return result
  }, [currentDate, scheduleMap])

  // 当前选中日期的排课
  const selectedSchedules = selectedDate ? scheduleMap.get(selectedDate) || [] : []

  // 导航
  const goPrev = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    setSelectedDate(null)
  }
  const goNext = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    setSelectedDate(null)
  }
  const goToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(null)
  }

  // 当月排课总数
  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
  const monthCount = useMemo(() => {
    return schedules.filter((s) => s.date.startsWith(monthKey)).length
  }, [schedules, monthKey])

  return (
    <section className="card p-4">
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goPrev}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          aria-label="上个月"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-800">
            {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月
          </div>
          <div className="text-xs text-slate-400">{monthCount} 节课</div>
        </div>
        <button
          onClick={goNext}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          aria-label="下个月"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 回到今天 */}
      <button
        onClick={goToday}
        className="text-xs text-brand-600 hover:text-brand-700 mb-2"
      >
        回到今天
      </button>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 mb-1">
        {CAL_WEEKDAYS.map((day) => (
          <div key={day} className="py-1.5 text-center text-xs font-medium text-slate-400">
            {day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, index) => {
          const dayNum = cell.date.getDate()
          const hasSchedule = cell.count > 0
          const isSelected = cell.dateStr === selectedDate
          return (
            <button
              key={index}
              onClick={() => hasSchedule && setSelectedDate(cell.dateStr)}
              disabled={!hasSchedule || !cell.isCurrentMonth}
              className={cn(
                'aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-all relative',
                cell.isToday
                  ? 'bg-brand-500 text-white font-bold'
                  : isSelected
                    ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300'
                    : hasSchedule && cell.isCurrentMonth
                      ? 'bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer'
                      : cell.isCurrentMonth
                        ? 'text-slate-300'
                        : 'text-slate-200',
              )}
            >
              <span>{dayNum}</span>
              {hasSchedule && cell.isCurrentMonth && !cell.isToday && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand-400" />
              )}
            </button>
          )
        })}
      </div>

      {/* 选中日期的排课详情 */}
      {selectedDate && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="text-xs font-medium text-slate-500 mb-2">
            {formatDateCN(selectedDate)}（{selectedSchedules.length} 节）
          </div>
          {selectedSchedules.length > 0 ? (
            <div className="space-y-2">
              {selectedSchedules.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-sm bg-slate-50 rounded-lg p-2.5">
                  <span className="text-slate-400 text-xs font-mono mt-0.5 whitespace-nowrap">
                    {s.startTime || '--:--'}-{s.endTime || '--:--'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-700 font-medium">{s.courseName}</div>
                    {(s.teacher || s.location) && (
                      <div className="text-xs text-slate-400 truncate">
                        {[s.teacher, s.location].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-2 text-center">该日期无排课</p>
          )}
        </div>
      )}

      {/* 图例 */}
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-brand-400" /> 有课
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-brand-500" /> 今天
        </span>
      </div>
    </section>
  )
}
