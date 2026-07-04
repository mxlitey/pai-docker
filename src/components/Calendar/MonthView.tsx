import type { Schedule } from '@/types'
import { getMonthCells, WEEKDAYS } from '@/utils/date'
import { cn } from '@/utils/cn'
import { ScheduleCard } from '../ScheduleCard'

interface MonthViewProps {
  currentDate: Date
  schedules: Schedule[]
  onScheduleClick: (schedule: Schedule) => void
}

export function MonthView({ currentDate, schedules, onScheduleClick }: MonthViewProps) {
  const cells = getMonthCells(currentDate, schedules)
  const today = new Date()

  return (
    <div className="card overflow-hidden">
      {/* 星期表头 */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-slate-500"
          >
            周{day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 grid-rows-6">
        {cells.map((cell, index) => {
          const dayNum = cell.date.getDate()
          const isWeekend = index % 7 >= 5

          return (
            <div
              key={index}
              className={cn(
                'min-h-[90px] sm:min-h-[110px] border-b border-r border-slate-100 p-1 overflow-hidden',
                !cell.isCurrentMonth && 'bg-slate-50/50',
                (index + 1) % 7 === 0 && 'border-r-0',
                index >= 35 && 'border-b-0',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-6 text-xs rounded-full',
                    cell.isToday
                      ? 'bg-brand-500 text-white font-semibold'
                      : cell.isCurrentMonth
                        ? isWeekend
                          ? 'text-rose-400'
                          : 'text-slate-600'
                        : 'text-slate-300',
                  )}
                >
                  {dayNum}
                </span>
                {cell.schedules.length > 0 && cell.isCurrentMonth && (
                  <span className="text-[10px] text-slate-400">
                    {cell.schedules.length}节
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {cell.schedules.slice(0, 3).map((s) => (
                  <ScheduleCard
                    key={s.id}
                    schedule={s}
                    compact
                    onClick={onScheduleClick}
                  />
                ))}
                {cell.schedules.length > 3 && (
                  <div className="text-[10px] text-slate-400 pl-1">
                    +{cell.schedules.length - 3} 更多
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 今日提示 */}
      {cells.some((c) => c.isToday) && (
        <div className="hidden">今天 {today.toDateString()}</div>
      )}
    </div>
  )
}
