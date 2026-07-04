import { useState, useEffect } from 'react'
import type { Schedule } from '@/types'
import { getWeekDays, formatDate, groupSchedulesByDate } from '@/utils/date'
import { cn } from '@/utils/cn'
import { ScheduleCard } from '../ScheduleCard'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

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
    const t = formatDate(today)
    setSelectedDay(
      weekDays.some((d) => formatDate(d) === t) ? t : formatDate(weekDays[0]),
    )
  }, [currentDate])

  const selectedSchedules = (byDate[selectedDay] || []).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )

  return (
    <div className="card overflow-hidden">
      {/* ============ 星期表头（共用，大屏可点击高亮当日列；小屏作为日期切换 tabs） ============ */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
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
                'py-2 text-center border-r border-slate-100 last:border-r-0 transition-colors',
                'sm:cursor-default sm:pointer-events-none',
                isSelected && 'bg-white',
              )}
              type="button"
            >
              <div className="text-xs text-slate-400">
                周{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}
              </div>
              <div
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 mt-1 text-sm rounded-full',
                  isToday
                    ? 'bg-brand-500 text-white font-semibold'
                    : isSelected
                      ? 'text-brand-600 font-semibold'
                      : 'text-slate-700',
                )}
              >
                {format(day, 'd')}
              </div>
              {/* 大屏：显示节数文字 */}
              <div className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">
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

      {/* ============ 小屏：列表式（按选中日展示） ============ */}
      <div className="sm:hidden p-4">
        {/* 选中日标题 */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-semibold text-slate-800">
              {format(
                weekDays.find((d) => formatDate(d) === selectedDay) || weekDays[0],
                'M月d日 EEEE',
                { locale: zhCN },
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              共 {selectedSchedules.length} 节课
            </div>
          </div>
        </div>

        {/* 当日课程列表 */}
        {selectedSchedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm">今日无排课</span>
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

        {/* 提示 */}
        <div className="mt-4 text-center text-xs text-slate-400">
          点击上方日期切换查看
        </div>
      </div>
    </div>
  )
}
