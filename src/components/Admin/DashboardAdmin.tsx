// BI 数据看板 —— 复用报表后端，汇总营收 / 课时消耗 / 报名数
import { useEffect, useState } from 'react'
import type { ReportQuery } from '@/types'
import { getReport } from '@/api/admin'
import {
  Button,
  EmptyState,
  LoadingBlock,
  SubPageHeader,
  inputClass,
  toast,
} from '@/components/ui'

interface DashboardAdminProps {
  onBack: () => void
}

interface SummaryData {
  revenue: number
  hoursConsumed: number
  enrollmentCount: number
}

// 取本月日期范围：startDate=月初，endDate=月末
function currentMonthRange(): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0) // 当月最后一天
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { startDate: fmt(start), endDate: fmt(end) }
}

function formatYuan(v: number): string {
  return '¥' + (Number.isFinite(v) ? v.toFixed(2) : '0.00')
}

export function DashboardAdmin({ onBack }: DashboardAdminProps) {
  const init = currentMonthRange()
  const [startDate, setStartDate] = useState(init.startDate)
  const [endDate, setEndDate] = useState(init.endDate)

  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  // 查询触发器：点「查询」自增；改日期不自动查
  const [queryTick, setQueryTick] = useState(0)

  async function load() {
    setLoading(true)
    try {
      const baseQuery = { startDate, endDate }
      // 并发拉取：营收 / 课时消耗 / 报名数
      const [revRes, hoursRes, enrollRes] = await Promise.all([
        getReport({ type: 'revenue', ...baseQuery } as ReportQuery),
        getReport({ type: 'hours-consumption', ...baseQuery } as ReportQuery),
        getReport({ type: 'enrollment-stats', ...baseQuery } as ReportQuery),
      ])

      if (revRes.code !== 0) throw new Error(revRes.message || '营收查询失败')
      if (hoursRes.code !== 0) throw new Error(hoursRes.message || '课时消耗查询失败')
      if (enrollRes.code !== 0) throw new Error(enrollRes.message || '报名统计查询失败')

      const revenue = Number(revRes.data.summary?.revenue ?? 0)
      const hoursConsumed = Number(hoursRes.data.summary?.consumed ?? 0)
      const enrollmentCount = Number(enrollRes.data.summary?.count ?? 0)

      setSummary({ revenue, hoursConsumed, enrollmentCount })
    } catch (e) {
      toast.error((e as Error).message || '加载看板失败')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // startDate/endDate 故意不列入依赖：改日期不自动查询
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTick])

  const handleQuery = () => setQueryTick((t) => t + 1)

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={'数据看板'} onBack={onBack} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 日期筛选 */}
        <section className="card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 w-40">
              <span className="text-xs text-slate-500">{'开始日期'}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 w-40">
              <span className="text-xs text-slate-500">{'结束日期'}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <Button variant="primary" loading={loading} onClick={handleQuery}>
              {'查询'}
            </Button>
          </div>
        </section>

        {/* summary 卡片 */}
        {loading ? (
          <LoadingBlock />
        ) : summary ? (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-5">
              <div className="text-xs text-slate-500">{'总营收'}</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">
                {formatYuan(summary.revenue)}
              </div>
            </div>
            <div className="card p-5">
              <div className="text-xs text-slate-500">{'课时消耗'}</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">
                {summary.hoursConsumed}
              </div>
            </div>
            <div className="card p-5">
              <div className="text-xs text-slate-500">{'报名数'}</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">
                {summary.enrollmentCount}
              </div>
            </div>
          </section>
        ) : (
          <EmptyState title={'暂无数据'} description="尝试调整日期范围后重新查询" />
        )}
      </main>
    </div>
  )
}
