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
      {/* ============ 大屏：7列网格（保持原样） ============ */}
      <div className="hidden sm:block">
        {/* 星期表头 */}
        <div className="grid grid-cols-7 border-b border-border bg-background">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {'周'}{day}
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
                  'min-h-[110px] border-b border-r border-border p-1 overflow-hidden',
                  !cell.isCurrentMonth && 'bg-background/50',
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
                            : 'text-muted-foreground'
                          : 'text-muted-foreground/40',
                    )}
                  >
                    {dayNum}
                  </span>
                  {cell.schedules.length > 0 && cell.isCurrentMonth && (
                    <span className="text-[10px] text-muted-foreground/70">
                      {cell.schedules.length}{'节'}
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
                    <div className="text-[10px] text-muted-foreground/70 pl-1">
                      +{cell.schedules.length - 3} {'更多'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ============ 小屏：日历样式 + 整体横向滚动（每格约 110px，便于看清信息） ============ */}
      <div className="sm:hidden">
        {/* 顶部滑动提示 */}
        <div className="px-3 py-2 text-center text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
          {'← 左右滑动查看更多日期 →'}
        </div>
        {/* 横向滚动容器：日历整体宽度 770px，超出屏宽可滑动 */}
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <div className="min-w-[770px]">
            {/* 星期表头 */}
            <div className="grid grid-cols-7 border-b border-border bg-background">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {'周'}{day}
                </div>
              ))}
            </div>
            {/* 日期网格（6 行 × 7 列，保持日历样式） */}
            <div className="grid grid-cols-7 grid-rows-6">
              {cells.map((cell, index) => {
                const dayNum = cell.date.getDate()
                const isWeekend = index % 7 >= 5

                return (
                  <div
                    key={index}
                    className={cn(
                      'min-h-[110px] border-b border-r border-border p-1.5 overflow-hidden',
                      !cell.isCurrentMonth && 'bg-background/50',
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
                                : 'text-muted-foreground'
                              : 'text-muted-foreground/40',
                        )}
                      >
                        {dayNum}
                      </span>
                      {cell.schedules.length > 0 && cell.isCurrentMonth && (
                        <span className="text-[10px] text-muted-foreground/70">
                          {cell.schedules.length}{'节'}
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
                        <div className="text-[10px] text-muted-foreground/70 pl-1">
                          +{cell.schedules.length - 3} {'更多'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 今日提示 */}
      {cells.some((c) => c.isToday) && (
        <div className="hidden">{'今天'} {today.toDateString()}</div>
      )}
    </div>
  )
}
