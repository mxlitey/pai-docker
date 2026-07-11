import { useState, useMemo } from 'react'
import type { Schedule } from '@/types'
import { cn } from '@/utils/cn'
import { getCourseDotClass } from '@/utils/courseColors'
import { todayLocal } from '@/utils/date'
import { Button, EmptyState, SubPageHeader, Modal, ModalFooter } from '@/components/ui'

interface AttendanceAdminProps {
  busy: boolean
  onBack: () => void
  onLoad: (date: string) => Promise<{ schedules: Schedule[]; total: number }>
  onSave: (
    date: string,
    items: { scheduleId: string; studentId: string; attended: boolean }[],
  ) => Promise<{ updatedSchedules: number; updatedEnrollments: number; errors: string[] }>
}

// 点名管理页
// - 选择日期 → 加载该日所有排课（按时间升序）
// - 每条排课显示学员/课程/时间，可勾选「到课/缺勤/未点名」三态
// - 支持「全选到课」「全选缺勤」「全选未点名」快捷按钮
// - 保存时仅提交有变化（与原 attended 不同的）的项
export function AttendanceAdmin({ busy, onBack, onLoad, onSave }: AttendanceAdminProps) {
  const [date, setDate] = useState(() => todayLocal())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedDate, setLoadedDate] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  // 点名失败弹窗：保存后若存在 errors，弹窗展示详细信息
  const [failModalOpen, setFailModalOpen] = useState(false)
  const [failErrors, setFailErrors] = useState<string[]>([])
  const [failSummary, setFailSummary] = useState({ updated: 0, enrollments: 0 })
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

  // 按「班级(课程) 年级」分组，便于分班级点名；班级内再按时间段二级分组
  // 分组键：classId（有班级）或 courseId（无班级的旧数据），标题格式「班级名(课程名) 年级」
  const groupedByClass = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string
        title: string
        subTitle: string
        teacher?: string
        location?: string
        color?: string
        schedules: Schedule[]
        timeGroups: {
          timeKey: string
          startTime: string
          endTime: string
          schedules: Schedule[]
        }[]
      }
    >()
    for (const s of schedules) {
      const key = s.classId || s.courseId || s.courseName
      let g = map.get(key)
      if (!g) {
        const className = s.className || ''
        const courseName = s.courseName || ''
        const grade = s.grade || ''
        // 标题：班级名(课程名)，无班级时仅显示课程名
        const title = className ? `${className}(${courseName})` : courseName
        // 副标题：年级
        const subTitle = grade || ''
        g = {
          key,
          title,
          subTitle,
          teacher: s.teacher,
          location: s.location,
          color: s.color,
          schedules: [],
          timeGroups: [],
        }
        map.set(key, g)
      }
      g.schedules.push(s)
    }
    const groups = Array.from(map.values())
    for (const g of groups) {
      // 班级内按时间段聚合
      const tgMap = new Map<
        string,
        { timeKey: string; startTime: string; endTime: string; schedules: Schedule[] }
      >()
      for (const s of g.schedules) {
        const st = s.startTime || '--:--'
        const et = s.endTime || '--:--'
        const tk = `${st}-${et}`
        let tg = tgMap.get(tk)
        if (!tg) {
          tg = { timeKey: tk, startTime: st, endTime: et, schedules: [] }
          tgMap.set(tk, tg)
        }
        tg.schedules.push(s)
      }
      const tgs = Array.from(tgMap.values())
      // 时间段按开始时间升序，同时间段内按学员名排序
      tgs.sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (const tg of tgs) {
        tg.schedules.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''))
      }
      g.timeGroups = tgs
      g.schedules.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    }
    // 组间按首节课时间升序
    groups.sort((a, b) =>
      (a.schedules[0]?.startTime || '').localeCompare(b.schedules[0]?.startTime || ''),
    )
    return groups
  }, [schedules])

  // 按课程批量设置出勤
  const setGroupAll = (group: { schedules: Schedule[] }, attended: boolean | undefined) => {
    setEditMap((m) => {
      const next = { ...m }
      for (const s of group.schedules) {
        next[s.id] = attended
      }
      return next
    })
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
        // 点名部分失败：弹窗展示详细信息
        setFailErrors(result.errors)
        setFailSummary({
          updated: result.updatedSchedules || 0,
          enrollments: result.updatedEnrollments || 0,
        })
        setFailModalOpen(true)
      } else {
        setSuccessMsg(
          `已更新 ${result.updatedSchedules} 条排课出勤、${result.updatedEnrollments} 条报名记录课时`,
        )
      }
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
      <SubPageHeader title={'点名管理'} onBack={onBack} count={loadedDate ? schedules.length : undefined} />

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
            <Button
              variant="primary"
              loading={loading}
              disabled={busy || !date}
              onClick={handleLoad}
            >
              {'加载当日排课'}
            </Button>
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

        {/* 排课列表（按课程分组） */}
        {loadedDate && schedules.length > 0 && (
          <section className="space-y-4">
            {/* 全局统计 + 快捷操作 */}
            <div className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 text-xs flex-wrap">
                  <span className="text-green-600">{'到课'} {stats.present}</span>
                  <span className="text-rose-500">{'缺勤'} {stats.absent}</span>
                  <span className="text-slate-400">{'未点名'} {stats.unset}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-brand-600">待保存 {changedItems.length}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setAll(true)}
                    className="btn-ghost border border-green-200 text-green-700 hover:bg-green-50 text-xs py-1 px-2.5"
                  >
                    {'全选到课'}
                  </button>
                  <button
                    onClick={() => setAll(false)}
                    className="btn-ghost border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs py-1 px-2.5"
                  >
                    {'全选缺勤'}
                  </button>
                  <button
                    onClick={() => setAll(undefined)}
                    className="btn-ghost border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs py-1 px-2.5"
                  >
                    {'全部未点名'}
                  </button>
                </div>
              </div>
            </div>

            {/* 按班级(课程)年级分组渲染 */}
            {groupedByClass.map((group) => {
              let gp = 0
              let ga = 0
              let gu = 0
              for (const s of group.schedules) {
                const v = editMap[s.id]
                if (v === true) gp++
                else if (v === false) ga++
                else gu++
              }
              return (
                <div key={group.key} className="card p-4 sm:p-5">
                  {/* 班级(课程)年级标题 */}
                  <div className="flex items-start sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-2.5 h-2.5 rounded-full flex-shrink-0',
                            getCourseDotClass(group.color),
                          )}
                        />
                        <h3 className="font-semibold text-slate-800 text-sm sm:text-base truncate">
                          {group.title}
                        </h3>
                        {group.subTitle && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                            {group.subTitle}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {group.schedules.length} 人
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        {group.teacher && <span>{group.teacher}</span>}
                        {group.location && <span>· {group.location}</span>}
                        <span className="text-slate-300">·</span>
                        <span className="text-green-600">到 {gp}</span>
                        <span className="text-rose-500">缺 {ga}</span>
                        <span className="text-slate-400">未 {gu}</span>
                      </div>
                    </div>
                  </div>

                  {/* 该课程的排课列表（按时间段二级分组） */}
                  <div className="space-y-3">
                    {group.timeGroups.map((tg) => {
                      let tp = 0
                      let ta = 0
                      let tu = 0
                      for (const s of tg.schedules) {
                        const v = editMap[s.id]
                        if (v === true) tp++
                        else if (v === false) ta++
                        else tu++
                      }
                      return (
                      <div key={tg.timeKey}>
                        {/* 时间段子标题 + 时间段级批量操作 */}
                        <div className="flex items-center justify-between gap-2 mb-1.5 px-1 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-slate-600 font-medium">
                              {tg.startTime}
                              <span className="text-slate-300 mx-1">→</span>
                              {tg.endTime}
                            </span>
                            <span className="text-xs text-slate-400">
                              {tg.schedules.length} 人
                            </span>
                            <span className="text-slate-300 text-xs">·</span>
                            <span className="text-xs text-green-600">到 {tp}</span>
                            <span className="text-xs text-rose-500">缺 {ta}</span>
                            <span className="text-xs text-slate-400">未 {tu}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setGroupAll({ schedules: tg.schedules }, true)}
                              className="btn-ghost border border-green-200 text-green-700 hover:bg-green-50 text-xs py-0.5 px-2"
                            >
                              全到
                            </button>
                            <button
                              onClick={() => setGroupAll({ schedules: tg.schedules }, false)}
                              className="btn-ghost border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs py-0.5 px-2"
                            >
                              全缺
                            </button>
                          </div>
                        </div>
                        {/* 该时间段的学员列表（时间已上移到子标题，不再逐条显示） */}
                        <div className="space-y-2">
                          {tg.schedules.map((s) => {
                            const cur = editMap[s.id]
                            return (
                              <div
                                key={s.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 hover:bg-slate-50/50"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="text-sm text-slate-800 font-medium truncate">
                                    {s.studentName}
                                  </div>
                                </div>

                                {/* 三态按钮：移动端占满宽度均分，桌面端右对齐 */}
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setItem(s.id, true)}
                                    className={cn(
                                      'flex-1 sm:flex-initial px-2.5 py-1 text-xs rounded transition-colors',
                                      cur === true
                                        ? 'bg-green-600 text-white'
                                        : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700',
                                    )}
                                  >
                                    {'到课'}
                                  </button>
                                  <button
                                    onClick={() => setItem(s.id, false)}
                                    className={cn(
                                      'flex-1 sm:flex-initial px-2.5 py-1 text-xs rounded transition-colors',
                                      cur === false
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-700',
                                    )}
                                  >
                                    {'缺勤'}
                                  </button>
                                  <button
                                    onClick={() => setItem(s.id, undefined)}
                                    className={cn(
                                      'flex-1 sm:flex-initial px-2.5 py-1 text-xs rounded transition-colors',
                                      cur === undefined
                                        ? 'bg-slate-400 text-white'
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                                    )}
                                    title="标记为未点名"
                                  >
                                    {'未点名'}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* 保存按钮 */}
            <div className="flex items-center justify-end pt-2">
              <Button
                variant="primary"
                loading={saving}
                disabled={busy || changedItems.length === 0}
                onClick={handleSave}
              >
                {saving ? '保存中…' : `保存点名（${changedItems.length} 条变化）`}
              </Button>
            </div>
          </section>
        )}

        {/* 无数据提示 */}
        {loadedDate && !loading && schedules.length === 0 && (
          <EmptyState title={'该日期无排课记录'} />
        )}
      </main>

      {/* 点名部分失败弹窗 */}
      {failModalOpen && (
        <Modal
          title={'点名部分失败'}
          onClose={() => setFailModalOpen(false)}
          size="md"
          footer={
            <ModalFooter
              onCancel={() => setFailModalOpen(false)}
              onConfirm={() => setFailModalOpen(false)}
              cancelText={'关闭'}
              confirmText={'知道了'}
            />
          }
        >
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              成功更新 <span className="font-medium text-green-600">{failSummary.updated}</span> 条排课出勤、
              <span className="font-medium text-green-600">{failSummary.enrollments}</span> 条报名记录课时。
            </div>
            <div className="text-sm text-rose-600 font-medium">
              以下 {failErrors.length} 项处理失败：
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-md p-3 space-y-1 max-h-60 overflow-y-auto">
              {failErrors.map((err, idx) => (
                <div key={idx} className="text-xs text-rose-700">
                  {idx + 1}. {err}
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-400">
              常见原因：学员未报名该课程、剩余课时不足、排课未关联课程等。请检查学员报名状态后重试。
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
