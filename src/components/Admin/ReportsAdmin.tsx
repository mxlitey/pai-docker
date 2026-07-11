// 报表中心：概览 + 按报表类型 / 时间范围 / 分组维度查询，展示汇总卡片 + 数据表格
import { useState, useEffect } from 'react'
import type { ReportType, ReportQuery } from '@/types'
import { getReport } from '@/api/admin'
import {
  Button,
  EmptyState,
  LoadingBlock,
  SubPageHeader,
  inputClass,
  toast,
} from '@/components/ui'
import { cn } from '@/utils/cn'
import { currentMonthRangeLocal } from '@/utils/date'

// 分组维度：比 ReportQuery.groupBy 更宽，enrollment-stats 支持 status
type GroupBy = 'day' | 'month' | 'course' | 'teacher' | 'status'

interface ColumnDef {
  key: string
  label: string
  format?: (v: unknown) => string
}

interface SummaryKeyDef {
  key: string
  label: string
  format?: (v: number) => string
}

interface ReportTypeConfig {
  type: ReportType
  label: string
  groupBy: GroupBy[]
  columns: ColumnDef[]
  summaryKeys: SummaryKeyDef[]
}

// 概览卡片定义：并发拉取多个报表的汇总值
interface OverviewCardDef {
  type: ReportType
  summaryKey: string
  label: string
  format?: (v: number) => string
}

const OVERVIEW_CARDS: OverviewCardDef[] = [
  { type: 'revenue', summaryKey: 'revenue', label: '总营收', format: v => '¥' + (v || 0).toFixed(2) },
  { type: 'hours-consumption', summaryKey: 'consumed', label: '课时消耗' },
  { type: 'enrollment-stats', summaryKey: 'count', label: '报名数' },
  { type: 'attendance-rate', summaryKey: 'rate', label: '出勤率', format: v => (v || 0) + '%' },
  { type: 'transfers', summaryKey: 'amount', label: '结转金额', format: v => '¥' + (v || 0).toFixed(2) },
]

// 分组维度中文标签
const GROUP_BY_LABELS: Record<GroupBy, string> = {
  day: '按日',
  month: '按月',
  course: '按课程',
  teacher: '按老师',
  status: '按状态',
}

// 报表类型配置：驱动 Tab / 筛选 / 列 / 汇总
const REPORT_TYPES: ReportTypeConfig[] = [
  {
    type: 'revenue',
    label: '营收报表',
    groupBy: ['day', 'month', 'course', 'teacher'],
    columns: [
      { key: 'key', label: '分组' },
      { key: 'revenue', label: '营收(¥)', format: v => '¥' + (Number(v) || 0).toFixed(2) },
      { key: 'count', label: '笔数' },
      { key: 'discount', label: '折扣(¥)', format: v => '¥' + (Number(v) || 0).toFixed(2) },
    ],
    summaryKeys: [
      { key: 'revenue', label: '总营收', format: v => '¥' + (v || 0).toFixed(2) },
      { key: 'count', label: '总笔数' },
      { key: 'discount', label: '总折扣', format: v => '¥' + (v || 0).toFixed(2) },
    ],
  },
  {
    type: 'hours-consumption',
    label: '课时消耗',
    groupBy: ['day', 'month', 'course', 'teacher'],
    columns: [
      { key: 'key', label: '分组' },
      { key: 'consumed', label: '消耗课时' },
    ],
    summaryKeys: [{ key: 'consumed', label: '总消耗' }],
  },
  {
    type: 'hours-balance',
    label: '课时余额',
    groupBy: ['course', 'teacher'],
    columns: [
      { key: 'key', label: '分组' },
      { key: 'remaining', label: '剩余课时' },
      { key: 'total', label: '总课时' },
    ],
    summaryKeys: [
      { key: 'remaining', label: '总剩余' },
      { key: 'total', label: '总课时' },
    ],
  },
  {
    type: 'attendance-rate',
    label: '出勤率',
    groupBy: ['course', 'teacher', 'day', 'month'],
    columns: [
      { key: 'key', label: '分组' },
      { key: 'total', label: '应到' },
      { key: 'attended', label: '实到' },
      { key: 'absent', label: '缺勤' },
      { key: 'rate', label: '出勤率', format: v => (Number(v) || 0) + '%' },
    ],
    summaryKeys: [
      { key: 'total', label: '应到' },
      { key: 'attended', label: '实到' },
      { key: 'rate', label: '总出勤率', format: v => (Number(v) || 0) + '%' },
    ],
  },
  {
    type: 'transfers',
    label: '结转统计',
    groupBy: ['day', 'month'],
    columns: [
      { key: 'key', label: '分组' },
      { key: 'amount', label: '结转金额(¥)', format: v => '¥' + (Number(v) || 0).toFixed(2) },
      { key: 'count', label: '笔数' },
    ],
    summaryKeys: [
      { key: 'amount', label: '总金额', format: v => '¥' + (v || 0).toFixed(2) },
      { key: 'count', label: '总笔数' },
    ],
  },
  {
    type: 'enrollment-stats',
    label: '报名统计',
    groupBy: ['course', 'status'],
    columns: [
      { key: 'key', label: '分组' },
      { key: 'count', label: '报名数' },
      { key: 'amount', label: '金额(¥)', format: v => '¥' + (Number(v) || 0).toFixed(2) },
    ],
    summaryKeys: [
      { key: 'count', label: '总报名数' },
      { key: 'amount', label: '总金额', format: v => '¥' + (v || 0).toFixed(2) },
    ],
  },
]

function findConfig(type: ReportType): ReportTypeConfig {
  return REPORT_TYPES.find(r => r.type === type) ?? REPORT_TYPES[0]
}

interface ReportsAdminProps {
  onBack: () => void
}

export function ReportsAdmin({ onBack }: ReportsAdminProps) {
  // 概览为首个 Tab，其后为各明细报表
  const [activeTab, setActiveTab] = useState<'overview' | ReportType>('overview')
  const [groupBy, setGroupBy] = useState<GroupBy>(REPORT_TYPES[0].groupBy[0])
  const initMonth = currentMonthRangeLocal()
  const [startDate, setStartDate] = useState(initMonth.startDate)
  const [endDate, setEndDate] = useState(initMonth.endDate)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [summary, setSummary] = useState<Record<string, number> | undefined>(undefined)
  // 概览汇总：cardKey -> 数值
  const [overview, setOverview] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  // 查询触发器：点「查询」按钮自增；改日期不自动查，仅靠此 tick 触发
  const [queryTick, setQueryTick] = useState(0)

  const isOverview = activeTab === 'overview'
  const currentConfig = !isOverview ? findConfig(activeTab) : null

  // 切换报表类型：若当前分组维度不被支持，重置为该类型的第一个选项
  const switchTab = (tab: 'overview' | ReportType) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    if (tab !== 'overview') {
      const cfg = findConfig(tab)
      if (!cfg.groupBy.includes(groupBy)) {
        setGroupBy(cfg.groupBy[0])
      }
    }
  }

  // 自动查询：挂载、切换 Tab、改分组维度时触发；日期不在此依赖中
  useEffect(() => {
    let cancelled = false
    async function loadOverview() {
      setLoading(true)
      try {
        const baseQuery = { startDate: startDate || undefined, endDate: endDate || undefined }
        const results = await Promise.all(
          OVERVIEW_CARDS.map(card =>
            getReport({ type: card.type, ...baseQuery } as ReportQuery).then(res => ({
              card,
              res,
            })),
          ),
        )
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const { card, res } of results) {
          if (res.code === 0) {
            const val = Number(res.data.summary?.[card.summaryKey] ?? 0)
            map[card.label] = Number.isFinite(val) ? val : 0
          } else {
            map[card.label] = 0
          }
        }
        setOverview(map)
      } catch (e) {
        if (cancelled) return
        toast.error((e as Error).message || '加载概览失败')
        setOverview({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    async function loadReport() {
      setLoading(true)
      try {
        const result = await getReport({
          type: activeTab as ReportType,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          // 后端实际支持 status，类型声明较窄，此处收窄断言
          groupBy: groupBy as ReportQuery['groupBy'],
        })
        if (cancelled) return
        if (result.code !== 0) {
          throw new Error(result.message || '查询失败')
        }
        setRows(result.data.rows)
        setSummary(result.data.summary)
      } catch (e) {
        if (cancelled) return
        toast.error((e as Error).message || '查询失败')
        setRows([])
        setSummary(undefined)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (isOverview) {
      loadOverview()
    } else {
      loadReport()
    }
    return () => {
      cancelled = true
    }
    // startDate/endDate 故意不列入依赖：改日期不自动查询
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, groupBy, queryTick])

  const handleQuery = () => setQueryTick(t => t + 1)

  return (
    <div className="min-h-full bg-background">
      <SubPageHeader title={'报表中心'} onBack={onBack} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Tab：概览 + 各报表类型（横向滚动） */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          <button
            onClick={() => switchTab('overview')}
            className={cn(
              'flex-shrink-0 px-4 py-2 text-sm rounded-md whitespace-nowrap transition-colors',
              isOverview
                ? 'bg-primary text-white'
                : 'bg-background text-muted-foreground border border-border hover:bg-muted/50',
            )}
          >
            概览
          </button>
          {REPORT_TYPES.map(rt => {
            const active = rt.type === activeTab
            return (
              <button
                key={rt.type}
                onClick={() => switchTab(rt.type)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 text-sm rounded-md whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-background text-muted-foreground border border-border hover:bg-muted/50',
                )}
              >
                {rt.label}
              </button>
            )
          })}
        </div>

        {/* 筛选区 */}
        <section className="card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 w-40">
              <span className="text-xs text-muted-foreground">{'开始日期'}</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 w-40">
              <span className="text-xs text-muted-foreground">{'结束日期'}</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className={inputClass}
              />
            </label>
            {!isOverview && currentConfig && (
              <label className="flex flex-col gap-1 w-32">
                <span className="text-xs text-muted-foreground">{'分组'}</span>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupBy)}
                  className={inputClass}
                >
                  {currentConfig.groupBy.map(g => (
                    <option key={g} value={g}>
                      {GROUP_BY_LABELS[g]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button variant="primary" loading={loading} onClick={handleQuery}>
              {'查询'}
            </Button>
          </div>
        </section>

        {/* 结果区 */}
        {loading ? (
          <LoadingBlock />
        ) : isOverview ? (
          // 概览：展示各关键指标卡片
          <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {OVERVIEW_CARDS.map(card => {
              const raw = overview[card.label] ?? 0
              const val = card.format ? card.format(raw) : String(raw)
              return (
                <div key={card.label} className="card p-5">
                  <div className="text-2xl font-semibold text-foreground">{val}</div>
                  <div className="text-xs text-muted-foreground/70 mt-1">{card.label}</div>
                </div>
              )
            })}
          </section>
        ) : (
          <>
            {/* 汇总卡片 */}
            {summary && currentConfig && currentConfig.summaryKeys.length > 0 && (
              <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {currentConfig.summaryKeys.map(sk => {
                  const raw = summary[sk.key]
                  const val =
                    raw !== undefined
                      ? sk.format
                        ? sk.format(raw)
                        : String(raw)
                      : '—'
                  return (
                    <div key={sk.key} className="card p-4">
                      <div className="text-2xl font-semibold text-foreground">
                        {val}
                      </div>
                      <div className="text-xs text-muted-foreground/70 mt-1">{sk.label}</div>
                    </div>
                  )
                })}
              </section>
            )}

            {/* 数据表格 */}
            {rows.length > 0 ? (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-background text-muted-foreground text-xs">
                        {currentConfig!.columns.map(c => (
                          <th
                            key={c.key}
                            className="text-left font-medium px-4 py-2.5 whitespace-nowrap"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {currentConfig!.columns.map(c => {
                            const raw = row[c.key]
                            const cell = c.format
                              ? c.format(raw)
                              : raw !== undefined && raw !== null
                                ? String(raw)
                                : '—'
                            return (
                              <td
                                key={c.key}
                                className="px-4 py-2.5 text-foreground whitespace-nowrap"
                              >
                                {cell}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState title={'暂无数据'} description="尝试调整筛选条件" />
            )}
          </>
        )}
      </main>
    </div>
  )
}
