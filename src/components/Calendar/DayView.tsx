import type { Schedule } from '@/types'
import { formatDate } from '@/utils/date'
import { ScheduleCard } from '../ScheduleCard'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ClipboardList } from 'lucide-react'

interface DayViewProps {
  currentDate: Date
  schedules: Schedule[]
  onScheduleClick: (schedule: Schedule) => void
}

// 时间段定义（labelKey 指向 i18n key）
const TIME_SLOTS = [
  { labelKey: '上午', range: '08:00 - 12:00', filter: (time: string) => time < '12:00' },
  { labelKey: '下午', range: '14:00 - 17:30', filter: (time: string) => time >= '12:00' && time < '18:00' },
  { labelKey: '晚上', range: '19:00 - 20:30', filter: (time: string) => time >= '18:00' },
]

export function DayView({ currentDate, schedules, onScheduleClick }: DayViewProps) {
  const dayStr = formatDate(currentDate)
  const daySchedules = schedules
    .filter((s) => s.date === dayStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <div className="card overflow-hidden">
      {/* 日期头部 */}
      <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-brand-50 to-transparent">
        <div className="text-lg font-semibold text-foreground">
          {format(currentDate, 'yyyy年M月d日 EEEE', { locale: zhCN })}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">
          {`共 ${daySchedules.length} 节课`}
        </div>
      </div>

      {/* 时间轴内容 */}
      <div className="p-5">
        {daySchedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70">
            <ClipboardList className="w-12 h-12 mb-3 opacity-50" strokeWidth={1.5} />
            <span className="text-sm">{'今日无排课'}</span>
          </div>
        ) : (
          <div className="space-y-6">
            {TIME_SLOTS.map((slot) => {
              const slotSchedules = daySchedules.filter((s) => slot.filter(s.startTime))
              if (slotSchedules.length === 0) return null
              return (
                <div key={slot.labelKey}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium text-foreground">{slot.labelKey}</span>
                    <div className="flex-1 h-px bg-muted" />
                    <span className="text-xs text-muted-foreground/70">{slotSchedules.length}{'节'}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-4">
                    {slotSchedules.map((s) => (
                      <ScheduleCard
                        key={s.id}
                        schedule={s}
                        onClick={onScheduleClick}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
