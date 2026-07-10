import { useState, useEffect, useMemo } from 'react'
import type { Course, Student, ClassInfo } from '@/types'
import { batchAddSchedules, getClassMembers } from '@/api/admin'
import { cn } from '@/utils/cn'
import { getCourseDotClass } from '@/utils/courseColors'
import { todayLocal } from '@/utils/date'
import { Modal, ModalFooter, Button, inputClass } from '@/components/ui'

interface ScheduleAddModalProps {
  courses: Course[]
  students: Student[]
  classes: ClassInfo[]
  onClose: () => void
  onUpdated: () => void
}

// 从学员列表提取所有年级（去重 + 排序，空年级不展示）
function collectGrades(students: Student[]): string[] {
  const set = new Set<string>()
  for (const s of students) {
    const g = (s.grade || '').trim()
    if (g) set.add(g)
  }
  return Array.from(set).sort()
}

export function ScheduleAddModal({ courses, students, classes, onClose, onUpdated }: ScheduleAddModalProps) {
  const [courseId, setCourseId] = useState('')
  // 班级：空字符串表示"手动选择学员"
  const [classId, setClassId] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)
  // 多日期：用户输入日期后点"添加"加入列表
  const [dateInput, setDateInput] = useState(() => todayLocal())
  const [dates, setDates] = useState<string[]>([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [teacher, setTeacher] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  // 年级过滤：空字符串表示"全部"
  const [grade, setGrade] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

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

  // 所有年级列表
  const grades = useMemo(() => collectGrades(students), [students])

  // 当前课程下的班级列表（未选课程时展示全部）
  const classOptions = useMemo(() => {
    if (!courseId) return classes
    return classes.filter((c) => !c.courseId || c.courseId === courseId)
  }, [classes, courseId])

  // 选课程时清空已选学员与班级（避免误操作）
  useEffect(() => {
    // 若当前班级不属于该课程，清空班级
    if (classId) {
      const cls = classes.find((c) => c.id === classId)
      if (cls && cls.courseId && cls.courseId !== courseId) {
        setClassId('')
      }
    }
    setSelectedStudentIds(new Set())
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
      // 切回"手动选择"：清空已选学员
      setSelectedStudentIds(new Set())
      return
    }
    const cls = classes.find((c) => c.id === nextClassId)
    if (!cls) return
    // 自动带入班级关联的课程（若当前未选或与班级课程不一致）
    if (cls.courseId && cls.courseId !== courseId) {
      setCourseId(cls.courseId)
    }
    // 带入班级默认值（覆盖课程默认值，班级更具体）
    if (cls.teacher) setTeacher(cls.teacher)
    if (cls.location) setLocation(cls.location)
    if (cls.defaultStartTime) setStartTime(cls.defaultStartTime)
    if (cls.defaultEndTime) setEndTime(cls.defaultEndTime)
    // 加载班级成员并自动勾选
    setLoadingMembers(true)
    try {
      const result = await getClassMembers(nextClassId)
      if (result.code === 0) {
        const ids = new Set(result.data.members.map((m) => m.id))
        setSelectedStudentIds(ids)
        if (ids.size === 0) {
          setError('该班级暂无成员，请先在「班级管理」中添加成员')
        }
      } else {
        setError(result.message || '加载班级成员失败')
        setSelectedStudentIds(new Set())
      }
    } catch (e) {
      setError('加载班级成员失败：' + (e as Error).message)
      setSelectedStudentIds(new Set())
    } finally {
      setLoadingMembers(false)
    }
  }

  // 按年级 + 搜索词过滤学员
  const filteredStudents = useMemo(() => {
    let list = students
    if (grade) {
      list = list.filter((s) => (s.grade || '').trim() === grade)
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
    )
  }, [students, grade, search])

  // 全选/取消全选（仅对当前过滤结果）
  const allFilteredSelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id))
  const toggleSelectAll = () => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredStudents.forEach((s) => next.delete(s.id))
      } else {
        filteredStudents.forEach((s) => next.add(s.id))
      }
      return next
    })
  }

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setError('')
    setSuccess('')
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

    if (!courseId || !selectedCourse) {
      setError('请选择课程')
      return
    }
    if (dates.length === 0) {
      setError('请至少添加一个日期')
      return
    }
    if (selectedStudentIds.size === 0) {
      setError('请至少选择一名学员')
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
        studentIds: Array.from(selectedStudentIds),
        classId: classId || undefined,
      })
      if (result.code === 0) {
        const msg = `已新增 ${result.data.created} 条排课` + (result.data.skipped > 0 ? `，跳过 ${result.data.skipped} 条重复` : '')
        setSuccess(msg)
        // 连续新增：清空日期，保留课程/班级/学员选择方便下一次操作
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
  const plannedCount = dates.length * selectedStudentIds.size
  const confirmText =
    plannedCount > 0
      ? `新增排课（${dates.length} 日 × ${selectedStudentIds.size} 人 = ${plannedCount} 条）`
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
        <div className="text-xs text-slate-400">
          <span className="text-rose-500">*</span> 为必填项，选择课程后将为每位选中学员在所选每个日期生成一条排课
          {classes.length > 0 && '；选择班级可自动带出成员名单与默认时间'}
        </div>

        {/* 课程选择 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'课程'}
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
                className={cn(inputClass, 'bg-white')}
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
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                <span className={cn('inline-block w-2.5 h-2.5 rounded-full', getCourseDotClass(selectedCourse.color))} />
                <span className="font-mono">{selectedCourse.id}</span>
              </div>
            )}
          </div>
        </div>

        {/* 班级选择（选填，选班级自动带出成员名单） */}
        {classes.length > 0 && (
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'班级'}</span>
            <div className="flex-1">
              <select
                value={classId}
                onChange={(e) => handleClassChange(e.target.value)}
                disabled={loadingMembers}
                className={cn(inputClass, 'bg-white', loadingMembers && 'opacity-60')}
              >
                <option value="">手动选择学员</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.memberCount ? ` · ${c.memberCount}人` : ''}
                  </option>
                ))}
              </select>
              {loadingMembers && (
                <div className="mt-1 text-xs text-slate-400">正在加载班级成员…</div>
              )}
              {selectedClass && !loadingMembers && (
                <div className="mt-1 text-xs text-slate-500">
                  已按班级带出成员，仍可在下方手动增删
                </div>
              )}
            </div>
          </div>
        )}

        {/* 日期（多选） */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'日期'}
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
              <div className="text-xs text-slate-400">尚未添加日期，可添加多个日期一次性排课</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {dates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-brand-50 text-brand-700 border border-brand-200 rounded-md"
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
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'时间'}</span>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
            <span className="text-slate-400">-</span>
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
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'教师'}</span>
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
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'地点'}</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            placeholder="如：A教室201"
          />
        </div>

        {/* 学员多选（先选年级） */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'学员'}
          </span>
          <div className="flex-1 border border-slate-200 rounded-md overflow-hidden">
            {/* 年级选择 + 搜索栏 + 全选 */}
            <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-slate-100 bg-slate-50">
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"
              >
                <option value="">全部年级</option>
                {grades.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索姓名 / ID"
                className="flex-1 min-w-[120px] px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <button
                type="button"
                onClick={toggleSelectAll}
                disabled={filteredStudents.length === 0}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 disabled:opacity-40 whitespace-nowrap"
              >
                {allFilteredSelected ? '取消全选' : '全选'}
              </button>
            </div>
            {/* 已选计数 */}
            <div className="px-2 py-1 text-xs text-slate-500 border-b border-slate-100 bg-white">
              已选 <span className="font-medium text-brand-600">{selectedStudentIds.size}</span> 名学员
              {filteredStudents.length !== students.length && (
                <span className="text-slate-400"> · 当前筛选 {filteredStudents.length} 名</span>
              )}
              {selectedClass && (
                <span className="text-slate-400"> · 来自班级「{selectedClass.name}」</span>
              )}
            </div>
            {/* 学员列表 */}
            <div className="max-h-48 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400">
                  {students.length === 0 ? '暂无学员数据' : '未找到匹配的学员'}
                </div>
              ) : (
                filteredStudents.map((s) => {
                  const checked = selectedStudentIds.has(s.id)
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-slate-50 last:border-0 transition-colors',
                        checked ? 'bg-brand-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(s.id)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-700 font-medium">{s.name}</span>
                        <span className="text-xs text-slate-400 ml-2 font-mono">{s.id}</span>
                        {s.grade && <span className="text-xs text-slate-400 ml-1">· {s.grade}</span>}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* 备注 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'备注'}</span>
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
          <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
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
