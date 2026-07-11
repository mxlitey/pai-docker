import { useState, useEffect } from 'react'
import type { Schedule } from '@/types'
import { getWeekDays, formatDate, groupSchedulesByDate } from '@/utils/date'
import { cn } from '@/utils/cn'
import { ScheduleCard } from '../ScheduleCard'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ClipboardList } from 'lucide-react'

interface WeekViewProps {
  currentDate: Date
  schedules: Schedule[]
  onScheduleClick: (schedule: Schedule) => void
}

export function WeekView({ currentDate, schedules, onScheduleClick }: WeekViewProps) {
  const weekDays = getWeekDays(currentDate)
  const today = new Date()
  const byDate = groupSchedulesByDate(schedules)

  // 小屏列表视图：默认选中今天，可点击日期切换显示哪天的课
  const todayStr = formatDate(today)
  const initialDay = weekDays.some((d) => formatDate(d) === todayStr)
    ? todayStr
    : formatDate(weekDays[0])
  const [selectedDay, setSelectedDay] = useState(initialDay)

  // 周变化时重置选中日
  useEffect(() => {
    const todayKey = formatDate(today)
    setSelectedDay(
      weekDays.some((d) => formatDate(d) === todayKey) ? todayKey : formatDate(weekDays[0]),
    )
  }, [currentDate])

  const selectedSchedules = (byDate[selectedDay] || []).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )

  const weekdayKeys = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div className="card overflow-hidden">
      {/* 小屏提示：日期切换说明 + 圆点图例 */}
      <div className="sm:hidden flex items-center justify-center gap-3 px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
        <span>{'点击下方日期切换查看'}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500" />
          {'表示当天有排课'}
        </span>
      </div>

      {/* ============ 星期表头（共用，大屏可点击高亮当日列；小屏作为日期切换 tabs） ============ */}
      <div className="grid grid-cols-7 border-b border-border bg-background">
        {weekDays.map((day) => {
          const isToday = day.toDateString() === today.toDateString()
          const dayStr = formatDate(day)
          const daySchedules = byDate[dayStr] || []
          const isSelected = dayStr === selectedDay

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(dayStr)}
              className={cn(
                'py-2 text-center border-r border-border last:border-r-0 transition-colors',
                'sm:cursor-default sm:pointer-events-none',
                isSelected && 'bg-background',
              )}
              type="button"
            >
              <div className="text-xs text-muted-foreground/70">
                {weekdayKeys[day.getDay()]}
              </div>
              <div
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 mt-1 text-sm rounded-full',
                  isToday
                    ? 'bg-brand-500 text-white font-semibold'
                    : isSelected
                      ? 'text-primary font-semibold'
                      : 'text-foreground',
                )}
              >
                {format(day, 'd')}
              </div>
              {/* 大屏：显示节数文字 */}
              <div className="text-[10px] text-muted-foreground/70 mt-0.5 hidden sm:block">
                {daySchedules.length > 0 ? `${daySchedules.length}节` : ''}
              </div>
              {/* 小屏：有课显示品牌色圆点，无课占位保持高度一致 */}
              <div className="sm:hidden h-2 mt-0.5 flex items-center justify-center">
                {daySchedules.length > 0 && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500" />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ============ 大屏：7列网格（保持原样） ============ */}
      <div className="hidden sm:grid grid-cols-7 min-h-[400px]">
        {weekDays.map((day) => {
          const dayStr = formatDate(day)
          const daySchedules = (byDate[dayStr] || []).sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          )
          return (
            <div
              key={day.toISOString()}
              className="border-r border-border last:border-r-0 p-1.5 space-y-2 min-h-[400px]"
            >
              {daySchedules.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <span className="text-xs text-muted-foreground/40">{'无课'}</span>
                </div>
              ) : (
                daySchedules.map((s) => (
                  <ScheduleCard
                    key={s.id}
                    schedule={s}
                    onClick={onScheduleClick}
                  />
                ))
              )}
            </div>
          )
        })}
      </div>

      {/* ============ 小屏：列表式（按选中日展示） ============ */}
      <div className="sm:hidden p-4">
        {/* 选中日标题 */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-semibold text-foreground">
              {format(
                weekDays.find((d) => formatDate(d) === selectedDay) || weekDays[0],
                'M月d日 EEEE',
                { locale: zhCN },
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {`共 ${selectedSchedules.length} 节课`}
            </div>
          </div>
        </div>

        {/* 当日课程列表 */}
        {selectedSchedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/70">
            <ClipboardList className="w-10 h-10 mb-2 opacity-50" strokeWidth={1.5} />
            <span className="text-sm">{'今日无排课'}</span>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedSchedules.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onClick={onScheduleClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
