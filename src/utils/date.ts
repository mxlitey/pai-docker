import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  addMonths,
  addWeeks,
  isSameDay,
  isSameMonth,
  parseISO,
  differenceInCalendarDays,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { CalendarCell, Schedule, ViewMode } from '@/types'

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

// 返回本地日期字符串 yyyy-MM-dd（基于浏览器本地时区）
// 用于默认日期输入值，避免 new Date().toISOString().slice(0,10) 在非 UTC 时区
// 跨日时返回"昨天"的问题
export function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 返回当月第一天到最后一天的本地日期字符串
// 用于报表/绩效/排课等页面的默认日期范围
export function currentMonthRangeLocal(): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0) // 当月最后一天
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { startDate: fmt(start), endDate: fmt(end) }
}

// 格式化日期为 yyyy-MM-dd
export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// 格式化日期为 yyyy-MM
export function formatMonth(date: Date): string {
  return format(date, 'yyyy-MM')
}

// 获取月视图的日历单元格（含上下月填充，共42格）
export function getMonthCells(date: Date, schedules: Schedule[]): CalendarCell[] {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  // 周一为一周起点
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const today = new Date()

  return days.map((day) => {
    const dayStr = formatDate(day)
    return {
      date: day,
      isCurrentMonth: isSameMonth(day, date),
      isToday: isSameDay(day, today),
      schedules: schedules.filter((s) => s.date === dayStr),
    }
  })
}

// 获取周视图的7个日期
export function getWeekDays(date: Date): Date[] {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

// 按日期分组排课
export function groupSchedulesByDate(schedules: Schedule[]): Record<string, Schedule[]> {
  return schedules.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = []
    acc[s.date].push(s)
    return acc
  }, {} as Record<string, Schedule[]>)
}

// 视图导航：根据当前视图返回前/后日期
export function navigateDate(date: Date, view: ViewMode, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1
  if (view === 'month') return addMonths(date, delta)
  if (view === 'week') return addWeeks(date, delta)
  return addDays(date, delta)
}

// 获取视图标题
export function getViewTitle(date: Date, view: ViewMode): string {
  if (view === 'month') return format(date, 'yyyy年M月', { locale: zhCN })
  if (view === 'week') {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
    if (isSameMonth(weekStart, weekEnd)) {
      return `${format(weekStart, 'yyyy年M月', { locale: zhCN })} ${format(weekStart, 'd')}-${format(weekEnd, 'd')}日`
    }
    return `${format(weekStart, 'yyyy年M月d日', { locale: zhCN })} - ${format(weekEnd, 'M月d日', { locale: zhCN })}`
  }
  return format(date, 'yyyy年M月d日 EEEE', { locale: zhCN })
}

// 根据日期范围计算需要加载的月份列表
export function getMonthsInRange(startDate: Date, endDate: Date): string[] {
  const months: string[] = []
  const cur = startOfMonth(startDate)
  const end = endOfMonth(endDate)
  let cursor = cur
  while (cursor <= end) {
    months.push(formatMonth(cursor))
    cursor = addMonths(cursor, 1)
  }
  return months
}

// 解析日期字符串
export function parseDate(dateStr: string): Date {
  return parseISO(dateStr)
}

// 计算天数差
export function daysBetween(start: Date, end: Date): number {
  return differenceInCalendarDays(end, start)
}

// 获取月份的起止日期
export function getMonthRange(date: Date): { start: Date; end: Date } {
  return { start: startOfMonth(date), end: endOfMonth(date) }
}

// 获取周的起止日期
export function getWeekRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  }
}
