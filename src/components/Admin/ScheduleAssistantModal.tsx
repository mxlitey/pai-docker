// 智能排课助手
// 流程：选学员+课程（自动带出教师/教室/时间）→ 选多个日期 → 检测冲突 → 一键排入空闲日期
// 冲突检测覆盖：教师时间冲突 / 学员时间冲突 / 教室时间冲突
import { useEffect, useMemo, useState } from 'react'
import type { Course, Student } from '@/types'
import {
  checkScheduleConflict,
  batchAddSchedules,
  type ConflictCheckResult,
} from '@/api/admin'
import { SearchBar } from '@/components/SearchBar'
import {
  Button,
  Field,
  Modal,
  ModalFooter,
  inputClass,
  toast,
} from '@/components/ui'
import { cn } from '@/utils/cn'

interface ScheduleAssistantModalProps {
  courses: Course[]
  onClose: () => void
  onCreated: () => void
}

// 周几中文
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 生成日期字符串 yyyy-MM-dd
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ScheduleAssistantModal({ courses, onClose, onCreated }: ScheduleAssistantModalProps) {
  const [student, setStudent] = useState<Student | null>(null)
  const [courseId, setCourseId] = useState('')
  const [teacher, setTeacher] = useState('')
  const [location, setLocation] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:30')

  // 日期选择：手动添加 + 按周重复生成
  const [manualDate, setManualDate] = useState('')
  const [dates, setDates] = useState<string[]>([])
  // 按周重复
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]) // 0=周日 … 6=周六
  const [repeatStart, setRepeatStart] = useState('')
  const [repeatEnd, setRepeatEnd] = useState('')

  // 冲突检测结果
  const [checking, setChecking] = useState(false)
  const [results, setResults] = useState<ConflictCheckResult[] | null>(null)
  const [creating, setCreating] = useState(false)

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) || null,
    [courses, courseId],
  )

  // 选课程时自动带出教师/教室/默认时间
  useEffect(() => {
    if (!selectedCourse) return
    setTeacher(selectedCourse.teacher || '')
    setLocation(selectedCourse.location || '')
    if (selectedCourse.defaultStartTime) setStartTime(selectedCourse.defaultStartTime)
    if (selectedCourse.defaultEndTime) setEndTime(selectedCourse.defaultEndTime)
  }, [selectedCourse])

  // 添加手动日期
  const addManualDate = () => {
    if (!manualDate) return
    if (dates.includes(manualDate)) {
      toast.error('该日期已添加')
      return
    }
    setDates((prev) => [...prev, manualDate].sort())
    setManualDate('')
  }

  // 移除日期
  const removeDate = (d: string) => {
    setDates((prev) => prev.filter((x) => x !== d))
  }

  // 按周重复生成日期
  const generateRepeatDates = () => {
    if (repeatWeekdays.length === 0) {
      toast.error('请先选择每周哪几天上课')
      return
    }
    if (!repeatStart || !repeatEnd) {
      toast.error('请设置重复起止日期')
      return
    }
    const start = new Date(repeatStart)
    const end = new Date(repeatEnd)
    if (start > end) {
      toast.error('起始日期不能晚于结束日期')
      return
    }
    const generated: string[] = []
    const cur = new Date(start)
    // 限制最多 365 天，防止误填超大范围
    let guard = 0
    while (cur <= end && guard < 365) {
      if (repeatWeekdays.includes(cur.getDay())) {
        generated.push(formatDate(cur))
      }
      cur.setDate(cur.getDate() + 1)
      guard++
    }
    if (generated.length === 0) {
      toast.error('所选范围内没有匹配的日期')
      return
    }
    // 合并去重
    const merged = Array.from(new Set([...dates, ...generated])).sort()
    const added = merged.length - dates.length
    setDates(merged)
    toast.success(`已生成 ${added} 个日期，共 ${merged.length} 个`)
  }

  // 检测冲突
  const handleCheck = async () => {
    if (!student) {
      toast.error('请先选择学员')
      return
    }
    if (!courseId) {
      toast.error('请先选择课程')
      return
    }
    if (dates.length === 0) {
      toast.error('请先添加上课日期')
      return
    }
    if (!startTime || !endTime) {
      toast.error('请设置上课时间')
      return
    }
    if (startTime >= endTime) {
      toast.error('开始时间必须早于结束时间')
      return
    }
    setChecking(true)
    setResults(null)
    try {
      const result = await checkScheduleConflict({
        studentId: student.id,
        teacher: teacher || undefined,
        location: location || undefined,
        dates,
        startTime,
        endTime,
      })
      if (result.code === 0) {
        setResults(result.data.results || [])
        const free = result.data.free
        const conflict = result.data.conflict
        if (conflict === 0) {
          toast.success(`全部 ${free} 个日期空闲，可直接排课`)
        } else {
          toast.info(`检测完成：${free} 个空闲，${conflict} 个有冲突`)
        }
      } else {
        toast.error(result.message || '冲突检测失败')
      }
    } catch (e) {
      toast.error((e as Error).message || '冲突检测失败')
    } finally {
      setChecking(false)
    }
  }

  // 排入空闲日期
  const freeDates = useMemo(() => {
    if (!results) return []
    return results.filter((r) => r.conflicts.length === 0).map((r) => r.date)
  }, [results])

  const conflictDates = useMemo(() => {
    if (!results) return []
    return results.filter((r) => r.conflicts.length > 0)
  }, [results])

  const handleCreate = async () => {
    if (!student || !selectedCourse) return
    if (freeDates.length === 0) {
      toast.error('没有可排入的空闲日期')
      return
    }
    setCreating(true)
    try {
      const result = await batchAddSchedules({
        courseId: selectedCourse.id,
        courseName: selectedCourse.name,
        teacher: teacher || undefined,
        location: location || undefined,
        color: selectedCourse.color || undefined,
        dates: freeDates,
        startTime,
        endTime,
        studentIds: [student.id],
      })
      if (result.code === 0) {
        const created = result.data.created
        const skipped = result.data.skipped
        if (created > 0) {
          toast.success(`成功排入 ${created} 节课${skipped > 0 ? `，跳过 ${skipped} 节` : ''}`)
        } else {
          toast.info('没有新排入的课程（可能已存在）')
        }
        onCreated()
      } else {
        toast.error(result.message || '排课失败')
      }
    } catch (e) {
      toast.error((e as Error).message || '排课失败')
    } finally {
      setCreating(false)
    }
  }

  // 冲突类型颜色与文案
  const conflictLabel = (type: string): { text: string; cls: string } => {
    if (type === 'teacher') return { text: '教师冲突', cls: 'bg-amber-100 text-amber-700' }
    if (type === 'student') return { text: '学员冲突', cls: 'bg-rose-100 text-rose-700' }
    if (type === 'location') return { text: '教室冲突', cls: 'bg-violet-100 text-violet-700' }
    return { text: type, cls: 'bg-slate-100 text-slate-700' }
  }

  return (
    <Modal
      title="智能排课助手"
      size="lg"
      onClose={onClose}
      footer={
        <ModalFooter
          loading={creating}
          onCancel={onClose}
          onConfirm={handleCreate}
          confirmText={freeDates.length > 0 ? `排入 ${freeDates.length} 个空闲日期` : '排入空闲日期'}
          confirmDisabled={freeDates.length === 0 || creating}
        />
      }
    >
      <div className="space-y-4">
        {/* 说明 */}
        <div className="text-xs text-slate-500 bg-brand-50/40 rounded p-2 leading-relaxed">
          智能排课助手会根据所选学员、教师、教室和时间，自动检测多个候选日期的排课冲突，
          帮你快速筛选出空闲日期并一键排课。
        </div>

        {/* 学员 + 课程 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="学员 *">
            {student ? (
              <div className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded bg-slate-50">
                <span className="text-sm text-slate-700">
                  {student.name}
                  {student.grade ? <span className="ml-2 text-xs text-slate-400">{student.grade}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => setStudent(null)}
                  className="text-xs text-brand-600 hover:text-brand-700"
                >
                  更换
                </button>
              </div>
            ) : (
              <SearchBar onSelectStudent={setStudent} />
            )}
          </Field>
          <Field label="课程 *">
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className={inputClass}
            >
              <option value="">请选择课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* 教师 / 教室 / 时间 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="教师">
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="可选"
              className={inputClass}
            />
          </Field>
          <Field label="教室">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="可选"
              className={inputClass}
            />
          </Field>
          <Field label="开始时间">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              step={300}
              className={inputClass}
            />
          </Field>
          <Field label="结束时间">
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              step={300}
              className={inputClass}
            />
          </Field>
        </div>

        {/* 日期选择 */}
        <Field label={`上课日期 *（已选 ${dates.length} 个）`}>
          {/* 手动添加 */}
          <div className="flex items-center gap-2 mb-2">
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className={cn(inputClass, 'flex-1')}
            />
            <Button variant="outline" onClick={addManualDate} disabled={!manualDate}>
              添加
            </Button>
          </div>

          {/* 按周重复生成 */}
          <div className="border border-slate-200 rounded p-2 space-y-2 bg-slate-50/50">
            <div className="text-xs text-slate-500">按周重复生成（可选）</div>
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_LABELS.map((label, idx) => {
                const active = repeatWeekdays.includes(idx)
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setRepeatWeekdays((prev) =>
                        active ? prev.filter((x) => x !== idx) : [...prev, idx],
                      )
                    }}
                    className={cn(
                      'px-2 py-1 text-xs rounded border transition-colors',
                      active
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">起始</span>
                <input
                  type="date"
                  value={repeatStart}
                  onChange={(e) => setRepeatStart(e.target.value)}
                  className={cn(inputClass, 'w-36')}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">结束</span>
                <input
                  type="date"
                  value={repeatEnd}
                  onChange={(e) => setRepeatEnd(e.target.value)}
                  className={cn(inputClass, 'w-36')}
                />
              </label>
              <Button variant="outline" onClick={generateRepeatDates}>
                生成日期
              </Button>
            </div>
          </div>

          {/* 已选日期列表 */}
          {dates.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {dates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => removeDate(d)}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setDates([])}
                className="text-xs text-rose-500 hover:text-rose-600 px-1"
              >
                清空
              </button>
            </div>
          )}
        </Field>

        {/* 检测按钮 */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            loading={checking}
            onClick={handleCheck}
            disabled={!student || !courseId || dates.length === 0}
          >
            检测冲突
          </Button>
          {results && (
            <span className="text-xs text-slate-500">
              共 {results.length} 个日期：{freeDates.length} 空闲，{conflictDates.length} 冲突
            </span>
          )}
        </div>

        {/* 检测结果 */}
        {results && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {freeDates.length > 0 && (
              <div className="border border-emerald-200 rounded p-2 bg-emerald-50/40">
                <div className="text-xs font-medium text-emerald-700 mb-1">
                  ✓ 空闲日期（{freeDates.length}）
                </div>
                <div className="flex flex-wrap gap-1">
                  {freeDates.map((d) => (
                    <span
                      key={d}
                      className="px-2 py-0.5 text-xs bg-white text-emerald-700 border border-emerald-200 rounded"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {conflictDates.length > 0 && (
              <div className="border border-rose-200 rounded p-2 bg-rose-50/40">
                <div className="text-xs font-medium text-rose-700 mb-1">
                  ✗ 冲突日期（{conflictDates.length}）—— 已自动排除
                </div>
                <div className="space-y-1.5">
                  {conflictDates.map((r) => (
                    <div key={r.date} className="text-xs">
                      <div className="text-slate-700 font-medium">{r.date}</div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {r.conflicts.map((c, i) => {
                          const info = conflictLabel(c.type)
                          return (
                            <span
                              key={i}
                              className={cn('px-1.5 py-0.5 rounded text-xs', info.cls)}
                              title={`${c.value} ${c.schedule.startTime}~${c.schedule.endTime}`}
                            >
                              {info.text}：{c.value} {c.schedule.startTime}-{c.schedule.endTime}（{c.schedule.courseName}）
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
