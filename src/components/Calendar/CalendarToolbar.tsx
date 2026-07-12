import { addDays, addMonths, addWeeks, format, getISOWeek } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { ViewMode } from '@/types'
import { cn } from '@/utils/cn'
import { ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react'

interface CalendarToolbarProps {
  currentDate: Date
  view: ViewMode
  onNavigate: (direction: 'prev' | 'next' | 'today') => void
  onViewChange: (view: ViewMode) => void
}

const VIEW_OPTIONS: { labelKey: string; value: ViewMode }[] = [
  { labelKey: '月', value: 'month' },
  { labelKey: '周', value: 'week' },
  { labelKey: '日', value: 'day' },
]

// 判断当前展示的日期是否就是「本月/本周/今天」
function isCurrentPeriod(view: ViewMode, currentDate: Date): boolean {
  const now = new Date()
  if (view === 'month') {
    return (
      currentDate.getFullYear() === now.getFullYear() &&
      currentDate.getMonth() === now.getMonth()
    )
  }
  if (view === 'week') {
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    const startOfCurWeek = new Date(now)
    const day = (now.getDay() + 6) % 7 // 周一为 0
    startOfCurWeek.setDate(now.getDate() - day)
    const diff = Math.abs(currentDate.getTime() - startOfCurWeek.getTime())
    return diff < oneWeek
  }
  return currentDate.toDateString() === now.toDateString()
}

// 计算「回到本月/本周/今天」按钮文案 + 当前视图标题
function getNavInfo(
  view: ViewMode,
  currentDate: Date,
): {
  prev: string
  next: string
  todayLabel: string
  title: string
} {
  if (view === 'month') {
    const prev = addMonths(currentDate, -1)
    const next = addMonths(currentDate, 1)
    return {
      prev: `${prev.getMonth() + 1}月`,
      next: `${next.getMonth() + 1}月`,
      todayLabel: '本月',
      title: `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`,
    }
  }
  if (view === 'week') {
    const prev = addWeeks(currentDate, -1)
    const next = addWeeks(currentDate, 1)
    const weekNum = getISOWeek(currentDate)
    const monthLabel = format(currentDate, 'M月', { locale: zhCN })
    return {
      prev: `第${getISOWeek(prev)}周`,
      next: `第${getISOWeek(next)}周`,
      todayLabel: '本周',
      title: `${monthLabel} 第${weekNum}周`,
    }
  }
  // 日视图
  const prev = addDays(currentDate, -1)
  const next = addDays(currentDate, 1)
  return {
    prev: `${prev.getMonth() + 1}-${prev.getDate()}`,
    next: `${next.getMonth() + 1}-${next.getDate()}`,
    todayLabel: '今天',
    title: format(currentDate, 'M月d日 EEEE', { locale: zhCN }),
  }
}

export function CalendarToolbar({
  currentDate,
  view,
  onNavigate,
  onViewChange,
}: CalendarToolbarProps) {
  const info = getNavInfo(view, currentDate)
  const isCurrent = isCurrentPeriod(view, currentDate)
  const navBtnClass =
    'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background text-muted-foreground hover:bg-muted transition-colors whitespace-nowrap'

  return (
    <div className="space-y-2 px-1">
      {/* 当前视图标题（年份/月份/周次） */}
      <div className="text-sm font-semibold text-foreground whitespace-nowrap">
        {info.title}
      </div>

      {/* 导航按钮（左对齐） + 视图切换（右对齐），分立两侧 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onNavigate('prev')}
            className={navBtnClass}
            aria-label={view === 'month' ? '上个月' : view === 'week' ? '上一周' : '前一天'}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {info.prev}
          </button>

          {/* 回到本月/本周/今天：当前已在该周期时禁用 */}
          <button
            onClick={() => onNavigate('today')}
            disabled={isCurrent}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
              isCurrent
                ? 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-brand-600',
            )}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            {info.todayLabel}
          </button>

          <button
            onClick={() => onNavigate('next')}
            className={navBtnClass}
            aria-label={view === 'month' ? '下个月' : view === 'week' ? '下一周' : '后一天'}
          >
            {info.next}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 视图切换：月/周/日 */}
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={cn(
                'px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                view === opt.value
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {opt.labelKey}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
