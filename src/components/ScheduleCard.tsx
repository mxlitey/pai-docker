import type { Schedule } from '@/types'
import { cn } from '@/utils/cn'
import { getCourseCardClass } from '@/utils/courseColors'
import { Check, X } from 'lucide-react'

interface ScheduleCardProps {
  schedule: Schedule
  compact?: boolean
  onClick?: (schedule: Schedule) => void
}

export function ScheduleCard({ schedule, compact = false, onClick }: ScheduleCardProps) {
  const colorClass = getCourseCardClass(schedule.color, schedule.courseName)

  if (compact) {
    // 月视图中的紧凑卡片
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(schedule)
        }}
        className={cn(
          'relative block w-full text-left px-1.5 py-0.5 text-xs rounded truncate border transition-opacity hover:opacity-80',
          colorClass,
        )}
      >
        <span className="font-medium">{formatTimeShort(schedule.startTime)}</span>{' '}
        {schedule.courseName}
        <AttendanceBadge schedule={schedule} compact />
      </button>
    )
  }

  // 周/日视图中的完整卡片
  return (
    <button
      onClick={() => onClick?.(schedule)}
      className={cn(
        'relative block w-full text-left p-3 rounded-lg border transition-all hover:shadow-md hover:scale-[1.01]',
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
        <AttendanceBadge schedule={schedule} />
      </div>
    </button>
  )
}

// 出勤状态徽章（卡片右上角）
function AttendanceBadge({ schedule, compact = false }: { schedule: Schedule; compact?: boolean }) {
  if (schedule.attended === true) {
    // 到课：绿色对勾
    return (
      <span
        className={cn(
          'absolute bg-green-600 text-white rounded-full flex items-center justify-center shadow-sm',
          compact ? 'top-0 right-0 w-3.5 h-3.5' : 'top-1 right-1 w-4 h-4',
        )}
        title={'到课'}
      >
        <Check className={compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} strokeWidth={3.5} />
      </span>
    )
  }
  if (schedule.attended === false) {
    // 缺勤：红色叉号
    return (
      <span
        className={cn(
          'absolute bg-destructive text-white rounded-full flex items-center justify-center shadow-sm',
          compact ? 'top-0 right-0 w-3.5 h-3.5' : 'top-1 right-1 w-4 h-4',
        )}
        title={'缺勤'}
      >
        <X className={compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} strokeWidth={3.5} />
      </span>
    )
  }
  // 未点名：灰色小圆点（compact 时省略，避免月视图拥挤）
  if (!compact) {
    return (
      <span
        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-muted-foreground/60"
        title={'未点名'}
      />
    )
  }
  return null
}

function formatTimeShort(time: string): string {
  // 保留冒号分隔，如 16:00；空值返回原值
  return time || ''
}
