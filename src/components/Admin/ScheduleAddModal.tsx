import { useState, useEffect, useMemo } from 'react'
import type { Course, ClassInfo, ClassMember } from '@/types'
import { batchAddSchedules, getClassMembers } from '@/api/admin'
import { cn } from '@/utils/cn'
import { getCourseDotClass } from '@/utils/courseColors'
import { todayLocal } from '@/utils/date'
import { Modal, ModalFooter, Button, inputClass } from '@/components/ui'

interface ScheduleAddModalProps {
  courses: Course[]
  classes: ClassInfo[]
  onClose: () => void
  onUpdated: () => void
}

export function ScheduleAddModal({ courses, classes, onClose, onUpdated }: ScheduleAddModalProps) {
  const [courseId, setCourseId] = useState('')
  // 班级：必填，选班级后自动带出成员名单
  const [classId, setClassId] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [classMembers, setClassMembers] = useState<ClassMember[]>([])
  // 多日期：用户输入日期后点"添加"加入列表
  const [dateInput, setDateInput] = useState(() => todayLocal())
  const [dates, setDates] = useState<string[]>([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [teacher, setTeacher] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 选中的课程对象
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) || null,
    [courses, courseId],
  )

  // 选中的班级对象
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) || null,
    [classes, classId],
  )

  // 当前课程下的班级列表（未选课程时展示全部）
  const classOptions = useMemo(() => {
    if (!courseId) return classes
    return classes.filter((c) => !c.courseId || c.courseId === courseId)
  }, [classes, courseId])

  // 选课程时：若当前班级不属于该课程，清空班级及成员
  useEffect(() => {
    if (classId) {
      const cls = classes.find((c) => c.id === classId)
      if (cls && cls.courseId && cls.courseId !== courseId) {
        setClassId('')
        setClassMembers([])
      }
    }
    setError('')
    setSuccess('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  // 选班级时：自动带入班级关联课程 + 默认值 + 成员名单
  const handleClassChange = async (nextClassId: string) => {
    setClassId(nextClassId)
    setError('')
    setSuccess('')
    if (!nextClassId) {
      setClassMembers([])
      return
    }
    const cls = classes.find((c) => c.id === nextClassId)
    if (!cls) return
    // 自动带入班级关联的课程（若当前未选或与班级课程不一致）
    if (cls.courseId && cls.courseId !== courseId) {
      setCourseId(cls.courseId)
    }
    // 带入班级默认值
    if (cls.teacher) setTeacher(cls.teacher)
    if (cls.location) setLocation(cls.location)
    if (cls.defaultStartTime) setStartTime(cls.defaultStartTime)
    if (cls.defaultEndTime) setEndTime(cls.defaultEndTime)
    // 加载班级成员
    setLoadingMembers(true)
    try {
      const result = await getClassMembers(nextClassId)
      if (result.code === 0) {
        setClassMembers(result.data.members)
        if (result.data.members.length === 0) {
          setError('该班级暂无成员，请先在「班级管理」中添加成员')
        }
      } else {
        setError(result.message || '加载班级成员失败')
        setClassMembers([])
      }
    } catch (e) {
      setError('加载班级成员失败：' + (e as Error).message)
      setClassMembers([])
    } finally {
      setLoadingMembers(false)
    }
  }

  // 添加日期
  const handleAddDate = () => {
    setError('')
    setSuccess('')
    if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      setError('日期格式应为 yyyy-MM-dd')
      return
    }
    if (dates.includes(dateInput)) {
      setError('该日期已添加')
      return
    }
    setDates((prev) => [...prev, dateInput].sort())
  }

  // 移除日期
  const handleRemoveDate = (d: string) => {
    setDates((prev) => prev.filter((x) => x !== d))
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')

    if (!classId || !selectedClass) {
      setError('请选择班级')
      return
    }
    if (!courseId || !selectedCourse) {
      setError('请选择课程')
      return
    }
    if (dates.length === 0) {
      setError('请至少添加一个日期')
      return
    }
    if (classMembers.length === 0) {
      setError('该班级暂无成员，无法排课')
      return
    }

    setSaving(true)
    try {
      const result = await batchAddSchedules({
        courseId,
        courseName: selectedCourse.name,
        teacher,
        location,
        color: selectedCourse.color || '',
        dates,
        startTime,
        endTime,
        note,
        studentIds: classMembers.map((m) => m.id),
        classId,
      })
      if (result.code === 0) {
        const msg = `已新增 ${result.data.created} 条排课` + (result.data.skipped > 0 ? `，跳过 ${result.data.skipped} 条重复` : '')
        setSuccess(msg)
        // 连续新增：清空日期，保留课程/班级选择方便下一次操作
        setDates([])
        // 通知父组件刷新数据
        onUpdated()
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError('请求失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // 确认按钮文案：含已选数量统计
  const plannedCount = dates.length * classMembers.length
  const confirmText =
    plannedCount > 0
      ? `新增排课（${dates.length} 日 × ${classMembers.length} 人 = ${plannedCount} 条）`
      : '新增排课'

  return (
    <Modal
      title={'新增排课'}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          loading={saving}
          cancelText={'关闭'}
          confirmText={confirmText}
        />
      }
    >
      <div className="space-y-4">
        {/* 必填说明 */}
        <div className="text-xs text-muted-foreground/70">
          <span className="text-destructive">*</span> 为必填项，选择班级后自动带出成员名单，为每位成员在所选每个日期生成一条排课
        </div>

        {/* 课程选择 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">
            <span className="text-destructive mr-0.5">*</span>{'课程'}
          </span>
          <div className="flex-1">
            {courses.length === 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                暂无课程，请先在「课程管理」中新增课程
              </div>
            ) : (
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className={cn(inputClass, 'bg-background')}
              >
                <option value="">请选择课程…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.grade ? ` · ${c.grade}` : ''}
                  </option>
                ))}
              </select>
            )}
            {selectedCourse && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                <span className={cn('inline-block w-2.5 h-2.5 rounded-full', getCourseDotClass(selectedCourse.color))} />
                <span className="font-mono">{selectedCourse.id}</span>
              </div>
            )}
          </div>
        </div>

        {/* 班级选择（必填，选班级自动带出成员名单） */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">
            <span className="text-destructive mr-0.5">*</span>{'班级'}
          </span>
          <div className="flex-1">
            {classes.length === 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                暂无班级，请先在「班级管理」中新增班级并添加成员
              </div>
            ) : (
              <select
                value={classId}
                onChange={(e) => handleClassChange(e.target.value)}
                disabled={loadingMembers}
                className={cn(inputClass, 'bg-background', loadingMembers && 'opacity-60')}
              >
                <option value="">请选择班级…</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.memberCount ? ` · ${c.memberCount}人` : ''}
                  </option>
                ))}
              </select>
            )}
            {loadingMembers && (
              <div className="mt-1 text-xs text-muted-foreground/70">正在加载班级成员…</div>
            )}
            {selectedClass && !loadingMembers && (
              <div className="mt-1 text-xs text-muted-foreground">
                班级成员已自动带出，排课仅包含以下学员
              </div>
            )}
          </div>
        </div>

        {/* 日期（多选） */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">
            <span className="text-destructive mr-0.5">*</span>{'日期'}
          </span>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className={inputClass}
              />
              <Button type="button" variant="primary" onClick={handleAddDate}>
                添加
              </Button>
            </div>
            {dates.length === 0 ? (
              <div className="text-xs text-muted-foreground/70">尚未添加日期，可添加多个日期一次性排课</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {dates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/10 text-brand-700 border border-brand-200 rounded-md"
                  >
                    <span className="font-mono">{d}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDate(d)}
                      className="text-brand-400 hover:text-brand-700"
                      aria-label={`移除 ${d}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 时间 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">{'时间'}</span>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
            <span className="text-muted-foreground/70">-</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* 教师 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">{'教师'}</span>
          <input
            type="text"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
            className={inputClass}
            placeholder="如：张老师"
          />
        </div>

        {/* 地点 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">{'地点'}</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            placeholder="如：A教室201"
          />
        </div>

        {/* 班级成员（只读展示） */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">
            <span className="text-destructive mr-0.5">*</span>{'学员'}
          </span>
          <div className="flex-1 border border-border rounded-md overflow-hidden">
            {/* 已选计数 */}
            <div className="px-2 py-1 text-xs text-muted-foreground border-b border-border bg-background">
              共 <span className="font-medium text-primary">{classMembers.length}</span> 名学员
              {selectedClass && (
                <span className="text-muted-foreground/70"> · 来自班级「{selectedClass.name}」</span>
              )}
            </div>
            {/* 成员列表（只读） */}
            <div className="max-h-48 overflow-y-auto">
              {!classId ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground/70">
                  请先选择班级，成员名单将自动带出
                </div>
              ) : loadingMembers ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground/70">
                  正在加载班级成员…
                </div>
              ) : classMembers.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground/70">
                  该班级暂无成员，请先在「班级管理」中添加成员
                </div>
              ) : (
                classMembers.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0 bg-primary/5"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground/70 ml-2 font-mono">{s.id}</span>
                      {s.grade && <span className="text-xs text-muted-foreground/70 ml-1">· {s.grade}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 备注 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0 pt-2">{'备注'}</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder={'选填'}
          />
        </div>

        {/* 错误/成功提示 */}
        {error && (
          <div className="bg-destructive/10 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm text-green-700">
            ✓ {success}
          </div>
        )}
      </div>
    </Modal>
  )
}
