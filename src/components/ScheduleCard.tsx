import type { Schedule } from '@/types'
import { cn } from '@/utils/cn'

// 课程颜色映射，按课程名分配不同颜色
const courseColors: Record<string, string> = {
  数学: 'bg-blue-50 text-blue-700 border-blue-200',
  英语: 'bg-green-50 text-green-700 border-green-200',
  物理: 'bg-purple-50 text-purple-700 border-purple-200',
  化学: 'bg-orange-50 text-orange-700 border-orange-200',
  语文: 'bg-rose-50 text-rose-700 border-rose-200',
  生物: 'bg-teal-50 text-teal-700 border-teal-200',
}

function getCourseColor(courseName: string): string {
  for (const [key, color] of Object.entries(courseColors)) {
    if (courseName.includes(key)) return color
  }
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

interface ScheduleCardProps {
  schedule: Schedule
  compact?: boolean
  onClick?: (schedule: Schedule) => void
}

export function ScheduleCard({ schedule, compact = false, onClick }: ScheduleCardProps) {
  const colorClass = getCourseColor(schedule.courseName)

  if (compact) {
    // 月视图中的紧凑卡片
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(schedule)
        }}
        className={cn(
          'block w-full text-left px-1.5 py-0.5 text-xs rounded truncate border transition-opacity hover:opacity-80',
          colorClass,
        )}
      >
        <span className="font-medium">{formatTimeShort(schedule.startTime)}</span>{' '}
        {schedule.courseName}
      </button>
    )
  }

  // 周/日视图中的完整卡片
  return (
    <button
      onClick={() => onClick?.(schedule)}
      className={cn(
        'block w-full text-left p-3 rounded-lg border transition-all hover:shadow-md hover:scale-[1.01]',
        colorClass,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{schedule.courseName}</div>
          <div className="text-xs mt-1 opacity-80">
            {schedule.startTime} - {schedule.endTime}
          </div>
          <div className="text-xs mt-0.5 opacity-70 truncate">
            {schedule.teacher} · {schedule.location}
          </div>
        </div>
      </div>
    </button>
  )
}

function formatTimeShort(time: string): string {
  return time.replace(':', '')
}
