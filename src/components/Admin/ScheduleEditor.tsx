import { useState, useEffect } from 'react'
import type { Schedule, Student } from '@/types'
import { updateSchedule, deleteSchedule } from '@/api/admin'
import { cn } from '@/utils/cn'

interface ScheduleEditorProps {
  schedule: Schedule | null
  students: Student[]
  onClose: () => void
  onUpdated: () => void
}

// 表单初始值
function createForm(schedule: Schedule | null): Schedule {
  return (
    schedule || {
      id: '',
      studentId: '',
      studentName: '',
      courseName: '',
      teacher: '',
      location: '',
      date: '',
      startTime: '',
      endTime: '',
      note: '',
    }
  )
}

export function ScheduleEditor({
  schedule,
  students,
  onClose,
  onUpdated,
}: ScheduleEditorProps) {
  const [form, setForm] = useState<Schedule>(createForm(schedule))
  const [original, setOriginal] = useState<Schedule | null>(schedule)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setForm(createForm(schedule))
    setOriginal(schedule)
    setError('')
    setSuccess('')
  }, [schedule])

  if (!schedule) return null

  // 是否跨月/跨学员
  const isCrossMonth =
    original && (original.studentId !== form.studentId || original.date.slice(0, 7) !== form.date.slice(0, 7))

  const handleChange = (field: keyof Schedule, value: string) => {
    setForm((f) => {
      const next = { ...f, [field]: value }
      // 学员变更时同步 studentName
      if (field === 'studentId') {
        const student = students.find((s) => s.id === value)
        next.studentName = student?.name || ''
      }
      return next
    })
    setError('')
    setSuccess('')
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')

    // 校验
    if (!form.courseName.trim()) {
      setError('课程名称不能为空')
      return
    }
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('日期格式应为 yyyy-MM-dd')
      return
    }
    if (!form.studentId) {
      setError('请选择学员')
      return
    }

    setSaving(true)
    try {
      const result = await updateSchedule(original!, form)
      if (result.code === 0) {
        setSuccess(
          result.data.moved
            ? `已跨月迁移：${result.data.fromKey} → ${result.data.toKey}`
            : '排课已更新',
        )
        setTimeout(() => {
          onUpdated()
          onClose()
        }, 800)
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError('请求失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!original) return
    if (!confirm(`确认删除排课「${original.courseName}」(${original.date})？此操作不可恢复。`)) {
      return
    }
    setDeleting(true)
    try {
      const result = await deleteSchedule(original.id, original.studentId, original.date)
      if (result.code === 0) {
        setSuccess('排课已删除')
        setTimeout(() => {
          onUpdated()
          onClose()
        }, 800)
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError('请求失败：' + (e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-semibold text-base text-slate-800">编辑排课</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-4">
          {/* 不可编辑的 id */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0">排课ID</span>
            <span className="text-sm text-slate-600 font-mono bg-slate-50 px-2 py-1 rounded">
              {form.id}
            </span>
          </div>

          {/* 学员选择 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">学员</span>
            <select
              value={form.studentId}
              onChange={(e) => handleChange('studentId', e.target.value)}
              className={inputClass}
            >
              <option value="">请选择学员</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>

          {/* 课程名称 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">课程名称</span>
            <input
              type="text"
              value={form.courseName}
              onChange={(e) => handleChange('courseName', e.target.value)}
              className={inputClass}
              placeholder="如：数学提高班"
            />
          </div>

          {/* 日期 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">日期</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className={inputClass}
            />
          </div>

          {/* 时间 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">时间</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => handleChange('startTime', e.target.value)}
                className={inputClass}
              />
              <span className="text-slate-400">-</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => handleChange('endTime', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* 教师 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">教师</span>
            <input
              type="text"
              value={form.teacher}
              onChange={(e) => handleChange('teacher', e.target.value)}
              className={inputClass}
              placeholder="如：张老师"
            />
          </div>

          {/* 地点 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">地点</span>
            <input
              type="text"
              value={form.location}
              onChange={(e) => handleChange('location', e.target.value)}
              className={inputClass}
              placeholder="如：A教室201"
            />
          </div>

          {/* 备注 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">备注</span>
            <input
              type="text"
              value={form.note}
              onChange={(e) => handleChange('note', e.target.value)}
              className={inputClass}
              placeholder="可选"
            />
          </div>

          {/* 跨月提示 */}
          {isCrossMonth && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
              ⚠ 检测到跨月/跨学员变更，系统将自动迁移存储路径：
              <div className="mt-1 font-mono">
                schedules/{original?.studentId}/{original?.date.slice(0, 7)}.json
                <span className="mx-1">→</span>
                schedules/{form.studentId}/{form.date.slice(0, 7)}.json
              </div>
              {original && original.date.slice(0, 7) !== form.date.slice(0, 7) && (
                <div className="mt-1">原月份文件若清空将自动删除</div>
              )}
            </div>
          )}

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

        {/* 底部操作 */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between sticky bottom-0">
          <button
            onClick={handleDelete}
            disabled={deleting || saving}
            className="btn text-rose-600 hover:bg-rose-50"
          >
            {deleting ? '删除中…' : '删除排课'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className={cn('btn-primary', (saving || deleting) && 'opacity-50')}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
