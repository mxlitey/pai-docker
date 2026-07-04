import type { Schedule } from '@/types'
import { getWeekDays, formatDate, groupSchedulesByDate } from '@/utils/date'
import { cn } from '@/utils/cn'
import { ScheduleCard } from '../ScheduleCard'
import { format } from 'date-fns'

interface WeekViewProps {
  currentDate: Date
  schedules: Schedule[]
  onScheduleClick: (schedule: Schedule) => void
}

export function WeekView({ currentDate, schedules, onScheduleClick }: WeekViewProps) {
  const weekDays = getWeekDays(currentDate)
  const today = new Date()
  const byDate = groupSchedulesByDate(schedules)

  return (
    <div className="card overflow-hidden">
      {/* 星期表头 */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekDays.map((day) => {
          const isToday =
            day.toDateString() === today.toDateString()
          const daySchedules = byDate[formatDate(day)] || []
          return (
            <div
              key={day.toISOString()}
              className="py-2 text-center border-r border-slate-100 last:border-r-0"
            >
              <div className="text-xs text-slate-400">
                周{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}
              </div>
              <div
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 mt-1 text-sm rounded-full',
                  isToday ? 'bg-brand-500 text-white font-semibold' : 'text-slate-700',
                )}
              >
                {format(day, 'd')}
              </div>
              {daySchedules.length > 0 && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {daySchedules.length}节
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 排课内容 */}
      <div className="grid grid-cols-7 min-h-[400px]">
        {weekDays.map((day) => {
          const dayStr = formatDate(day)
          const daySchedules = (byDate[dayStr] || []).sort((a, b) =>
            a.startTime.localeCompare(b.startTime)
          )
          return (
            <div
              key={day.toISOString()}
              className="border-r border-slate-100 last:border-r-0 p-1.5 space-y-2 min-h-[400px]"
            >
              {daySchedules.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <span className="text-xs text-slate-300">无课</span>
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
    </div>
  )
}
