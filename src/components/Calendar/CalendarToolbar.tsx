import type { ViewMode } from '@/types'
import { cn } from '@/utils/cn'

interface CalendarToolbarProps {
  currentDate: Date
  view: ViewMode
  onNavigate: (direction: 'prev' | 'next' | 'today') => void
  onViewChange: (view: ViewMode) => void
}

const VIEW_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: '月', value: 'month' },
  { label: '周', value: 'week' },
  { label: '日', value: 'day' },
]

export function CalendarToolbar({
  currentDate,
  view,
  onNavigate,
  onViewChange,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      {/* 导航按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('prev')}
          className="btn-ghost p-1.5"
          aria-label="上一个"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={() => onNavigate('today')} className="btn-primary">
          今天
        </button>
        <button
          onClick={() => onNavigate('next')}
          className="btn-ghost p-1.5"
          aria-label="下一个"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 视图切换 */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onViewChange(opt.value)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
              view === opt.value
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
