import { useEffect } from 'react'
import type { Schedule } from '@/types'
import { parseDate } from '@/utils/date'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Check, X } from 'lucide-react'

interface ScheduleDetailProps {
  schedule: Schedule | null
  onClose: () => void
}

export function ScheduleDetail({ schedule, onClose }: ScheduleDetailProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (schedule) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [schedule, onClose])

  if (!schedule) return null

  const date = parseDate(schedule.date)

  const fields = [
    { label: '课程名称', value: schedule.courseName },
    { label: '授课教师', value: schedule.teacher },
    { label: '上课地点', value: schedule.location },
    { label: '日期', value: format(date, 'yyyy年M月d日 EEEE', { locale: zhCN }) },
    { label: '时间', value: `${schedule.startTime} - ${schedule.endTime}` },
    { label: '学员姓名', value: schedule.studentName },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-base text-foreground">{'排课详情'}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground transition-colors p-1"
            aria-label={'关闭'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-3">
          {fields.map((field) => (
            <div key={field.label} className="flex items-start gap-4">
              <span className="text-sm text-muted-foreground w-20 flex-shrink-0 pt-0.5">
                {field.label}
              </span>
              <span className="text-sm text-foreground font-medium flex-1">
                {field.value}
              </span>
            </div>
          ))}
          {schedule.note && (
            <div className="flex items-start gap-4">
              <span className="text-sm text-muted-foreground w-20 flex-shrink-0 pt-0.5">{'备注'}</span>
              <span className="text-sm text-muted-foreground flex-1">{schedule.note}</span>
            </div>
          )}
          {/* 出勤状态 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-muted-foreground w-20 flex-shrink-0 pt-0.5">{'出勤状态'}</span>
            <span className="text-sm font-medium flex-1">
              {schedule.attended === true ? (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                  {'到课'}
                </span>
              ) : schedule.attended === false ? (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <X className="w-4 h-4" strokeWidth={2.5} />
                  {'缺勤'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                  {'未点名'}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 bg-background border-t border-border flex justify-end">
          <button onClick={onClose} className="btn-ghost">
            {'关闭'}
          </button>
        </div>
      </div>
    </div>
  )
}
