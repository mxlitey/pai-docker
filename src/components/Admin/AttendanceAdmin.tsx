import { useState, useMemo } from 'react'
import type { Schedule } from '@/types'
import { cn } from '@/utils/cn'

interface AttendanceAdminProps {
  busy: boolean
  onBack: () => void
  onLoad: (date: string) => Promise<{ schedules: Schedule[]; total: number }>
  onSave: (
    date: string,
    items: { scheduleId: string; studentId: string; attended: boolean }[],
  ) => Promise<{ updatedSchedules: number; updatedStudents: number; errors: string[] }>
}

// 点名管理页
// - 选择日期 → 加载该日所有排课（按时间升序）
// - 每条排课显示学员/课程/时间，可勾选「到课/缺勤/未点名」三态
// - 支持「全选到课」「全选缺勤」「全选未点名」快捷按钮
// - 保存时仅提交有变化（与原 attended 不同的）的项
export function AttendanceAdmin({ busy, onBack, onLoad, onSave }: AttendanceAdminProps) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedDate, setLoadedDate] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  // 当前编辑的 attended 状态：scheduleId -> attended (true/false/undefined)
  const [editMap, setEditMap] = useState<Record<string, boolean | undefined>>({})
  const [saving, setSaving] = useState(false)

  const handleLoad = async () => {
    if (!date) return
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await onLoad(date)
      setSchedules(result.schedules)
      setLoadedDate(date)
      // 初始化编辑状态为当前排课的 attended
      const initMap: Record<string, boolean | undefined> = {}
      for (const s of result.schedules) {
        initMap[s.id] = s.attended
      }
      setEditMap(initMap)
    } catch (e) {
      setError((e as Error).message || '加载失败')
      setSchedules([])
      setEditMap({})
    } finally {
      setLoading(false)
    }
  }

  const setItem = (scheduleId: string, attended: boolean | undefined) => {
    setEditMap((m) => ({ ...m, [scheduleId]: attended }))
    setSuccessMsg('')
  }

  const setAll = (attended: boolean | undefined) => {
    const next: Record<string, boolean | undefined> = {}
    for (const s of schedules) {
      next[s.id] = attended
    }
    setEditMap(next)
    setSuccessMsg('')
  }

  // 统计有变化的项
  const changedItems = useMemo(() => {
    const items: { scheduleId: string; studentId: string; attended: boolean }[] = []
    for (const s of schedules) {
      const old = s.attended
      const cur = editMap[s.id]
      // 仅当新旧值不同（且新值已确定 = boolean）时才提交
      if (cur !== old && typeof cur === 'boolean') {
        items.push({ scheduleId: s.id, studentId: s.studentId, attended: cur })
      }
    }
    return items
  }, [schedules, editMap])

  // 统计：到课/缺勤/未点名数量
  const stats = useMemo(() => {
    let present = 0
    let absent = 0
    let unset = 0
    for (const s of schedules) {
      const v = editMap[s.id]
      if (v === true) present++
      else if (v === false) absent++
      else unset++
    }
    return { present, absent, unset }
  }, [schedules, editMap])

  const handleSave = async () => {
    if (changedItems.length === 0) {
      setError('没有变化，无需保存')
      return
    }
    setSaving(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await onSave(loadedDate, changedItems)
      if (result.errors && result.errors.length > 0) {
        setError(`保存部分失败：${result.errors.join('; ')}`)
      }
      setSuccessMsg(
        `已更新 ${result.updatedSchedules} 条排课出勤、${result.updatedStudents} 名学员课时`,
      )
      // 保存后重新加载以同步 attended 状态
      const r = await onLoad(loadedDate)
      setSchedules(r.schedules)
      const initMap: Record<string, boolean | undefined> = {}
      for (const s of r.schedules) {
        initMap[s.id] = s.attended
      }
      setEditMap(initMap)
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回后台
            </button>
            <span className="text-slate-300">/</span>
            <h1 className="text-base font-semibold text-slate-800">点名管理</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 日期选择 */}
        <section className="card p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">点名日期</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <button
              onClick={handleLoad}
              disabled={busy || loading || !date}
              className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50"
            >
              {loading ? '加载中…' : '加载当日排课'}
            </button>
            {loadedDate && (
              <span className="text-xs text-slate-400">
                已加载 {loadedDate} · 共 {schedules.length} 条
              </span>
            )}
          </div>
        </section>

        {/* 提示与错误 */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5 text-sm text-rose-700">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-700">
            {successMsg}
          </div>
        )}

        {/* 排课列表 */}
        {loadedDate && schedules.length > 0 && (
          <section className="card p-5">
            {/* 统计 + 快捷操作 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-green-600">到课 {stats.present}</span>
                <span className="text-rose-500">缺勤 {stats.absent}</span>
                <span className="text-slate-400">未点名 {stats.unset}</span>
                <span className="text-slate-300">|</span>
                <span className="text-brand-600">待保存 {changedItems.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAll(true)}
                  className="btn-ghost border border-green-200 text-green-700 hover:bg-green-50 text-xs py-1 px-2.5"
                >
                  全选到课
                </button>
                <button
                  onClick={() => setAll(false)}
                  className="btn-ghost border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs py-1 px-2.5"
                >
                  全选缺勤
                </button>
                <button
                  onClick={() => setAll(undefined)}
                  className="btn-ghost border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs py-1 px-2.5"
                >
                  全部未点名
                </button>
              </div>
            </div>

            {/* 列表 */}
            <div className="space-y-2">
              {schedules.map((s) => {
                const cur = editMap[s.id]
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2.5 hover:bg-slate-50/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* 时间 */}
                      <div className="text-xs text-slate-500 font-mono w-24 flex-shrink-0">
                        {s.startTime || '--:--'}
                        <span className="text-slate-300 mx-1">→</span>
                        {s.endTime || '--:--'}
                      </div>
                      {/* 学员 + 课程 */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 font-medium truncate">
                          {s.studentName}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {s.courseName}
                          {s.teacher ? ` · ${s.teacher}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* 三态切换 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setItem(s.id, true)}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded transition-colors',
                          cur === true
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700',
                        )}
                      >
                        到课
                      </button>
                      <button
                        onClick={() => setItem(s.id, false)}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded transition-colors',
                          cur === false
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-700',
                        )}
                      >
                        缺勤
                      </button>
                      <button
                        onClick={() => setItem(s.id, undefined)}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded transition-colors',
                          cur === undefined
                            ? 'bg-slate-400 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                        )}
                        title="标记为未点名"
                      >
                        未点名
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 保存按钮 */}
            <div className="flex items-center justify-end mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={handleSave}
                disabled={busy || saving || changedItems.length === 0}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? '保存中…' : `保存点名（${changedItems.length} 条变化）`}
              </button>
            </div>
          </section>
        )}

        {/* 无数据提示 */}
        {loadedDate && !loading && schedules.length === 0 && (
          <div className="card p-10 text-center text-slate-400 text-sm">
            该日期无排课记录
          </div>
        )}
      </main>
    </div>
  )
}
