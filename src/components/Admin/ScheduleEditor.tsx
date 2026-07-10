import { useState, useEffect, useRef, useMemo } from 'react'
import type { Schedule, Student } from '@/types'
import { updateSchedule, deleteSchedule } from '@/api/admin'
import { cn } from '@/utils/cn'
import { Modal, ModalFooter, Button, confirmDialog, inputClass } from '@/components/ui'

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
    original &&
    (original.studentId !== form.studentId || original.date.slice(0, 7) !== form.date.slice(0, 7))

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
      setError('请填写课程名称')
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
    const ok = await confirmDialog({
      title: '删除排课',
      message: `确认删除排课「${original.courseName}」(${original.date})？此操作不可恢复。`,
      danger: true,
      confirmText: '确认删除',
    })
    if (!ok) return
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

  return (
    <Modal
      title={'编辑排课'}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-between w-full items-center">
          <Button variant="danger" onClick={handleDelete} loading={deleting} disabled={saving}>
            {'删除排课'}
          </Button>
          <div className="flex gap-2">
            <ModalFooter
              onCancel={onClose}
              onConfirm={handleSave}
              loading={saving}
              confirmDisabled={deleting}
              cancelText={'取消'}
              confirmText={'保存'}
            />
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 必填说明 */}
        <div className="text-xs text-slate-400">
          <span className="text-rose-500">*</span> 为必填项
        </div>

        {/* 不可编辑的 id */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0">排课ID</span>
          <span className="text-sm text-slate-600 font-mono bg-slate-50 px-2 py-1 rounded break-all">
            {form.id}
          </span>
        </div>

        {/* 学员选择（搜索） */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'学员'}
          </span>
          <StudentSearchSelect
            students={students}
            value={form.studentId}
            onChange={(id) => handleChange('studentId', id)}
          />
        </div>

        {/* 课程名称 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'课程名称'}
          </span>
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
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'日期'}
          </span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => handleChange('date', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* 时间 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'时间'}</span>
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
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'教师'}</span>
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
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'地点'}</span>
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
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'备注'}</span>
          <input
            type="text"
            value={form.note}
            onChange={(e) => handleChange('note', e.target.value)}
            className={inputClass}
            placeholder={'选填'}
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
    </Modal>
  )
}

// ===== 学员搜索选择器 =====
// 解决两个问题：
// 1. 学员数量多时下拉选择困难
// 2. 重名学员无法区分（展示 id + 年级）
interface StudentSearchSelectProps {
  students: Student[]
  value: string
  onChange: (id: string) => void
}

function StudentSearchSelect({ students, value, onChange }: StudentSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => students.find((s) => s.id === value) || null,
    [students, value],
  )

  // 过滤结果：支持按姓名、id 模糊匹配
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
    )
  }, [students, query])

  // 重置高亮到第一项
  useEffect(() => {
    setHighlight(0)
  }, [query])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // 关闭时若已选中，恢复 query 为空（显示选中态）
        if (selected) setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, selected])

  const handleSelect = (s: Student) => {
    onChange(s.id)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && filtered[highlight]) {
        handleSelect(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="flex-1 relative" ref={containerRef}>
      {/* 输入框 / 显示选中态 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selected ? selected.name : ''}
          placeholder="搜索学员姓名 / ID"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={inputClass}
        />
        {/* 选中态标记 */}
        {selected && !open && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded">
            {selected.id}
          </span>
        )}
        {/* 下拉箭头 */}
        <svg
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform pointer-events-none',
            open && 'rotate-180',
          )}
          style={{ display: selected && !open ? 'none' : 'block' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 下拉列表 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              {students.length === 0 ? '暂无学员数据' : '未找到匹配的学员'}
            </div>
          ) : (
            filtered.map((s, idx) => (
              <div
                key={s.id}
                onClick={() => handleSelect(s)}
                onMouseEnter={() => setHighlight(idx)}
                className={cn(
                  'px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0',
                  idx === highlight ? 'bg-brand-50' : 'hover:bg-slate-50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700 font-medium truncate">{s.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="font-mono">{s.id}</span>
                      {s.grade && <span>· {s.grade}</span>}
                    </div>
                  </div>
                  {s.id === value && (
                    <svg className="w-4 h-4 text-brand-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
