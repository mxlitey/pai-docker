import { useMemo, useState } from 'react'
import type { Student } from '@/types'
import { cn } from '@/utils/cn'

interface StudentAdminProps {
  students: Student[]
  busy: boolean
  onBack: () => void
  onDelete: (student: Student) => void
  onAdd: (student: Student) => Promise<boolean>
  onUpdate: (student: Student) => Promise<boolean>
}

const PAGE_SIZE = 10

export function StudentAdmin({ students, busy, onBack, onDelete, onAdd, onUpdate }: StudentAdminProps) {
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE))
  // 当前页越界时回到最后一页（如删除后）
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return students.slice(start, start + PAGE_SIZE)
  }, [students, safePage])

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
            <h1 className="text-base font-semibold text-slate-800">学员管理</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">共 {students.length} 名学员</span>
            <button
              onClick={() => setAdding(true)}
              disabled={busy}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            >
              + 新增学员
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {students.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-slate-400 text-sm mb-3">暂无学员数据</div>
            <button
              onClick={() => setAdding(true)}
              disabled={busy}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            >
              + 新增第一个学员
            </button>
          </div>
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">姓名</th>
                    <th className="text-left py-2 px-2 font-medium">ID</th>
                    <th className="text-left py-2 px-2 font-medium">年级</th>
                    <th className="text-left py-2 px-2 font-medium">电话</th>
                    <th className="text-left py-2 px-2 font-medium">课时</th>
                    <th className="text-right py-2 px-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2 font-medium text-slate-700">{s.name}</td>
                      <td className="py-2.5 px-2 text-slate-500 font-mono text-xs">{s.id}</td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {s.grade || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {s.phone || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {s.hours !== undefined ? (
                          <span>
                            <span
                              className={
                                s.remainingHours === 0
                                  ? 'text-rose-600 font-medium'
                                  : s.remainingHours !== undefined && s.remainingHours < 0
                                  ? 'text-rose-600 font-medium'
                                  : 'text-slate-700 font-medium'
                              }
                            >
                              {s.remainingHours ?? s.hours}
                            </span>
                            <span className="text-slate-400"> / {s.hours}</span>
                            {s.remainingHours === 0 && (
                              <span className="ml-1 text-xs text-rose-500">已用完</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(s)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => onDelete(s)}
                          disabled={busy}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  第 {safePage} / {totalPages} 页 · 每页 {PAGE_SIZE} 条
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  {renderPageButtons(safePage, totalPages, setPage)}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* 新增学员弹窗 */}
      {adding && (
        <StudentEditModal
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      )}

      {/* 编辑学员弹窗 */}
      {editing && (
        <StudentEditModal
          student={editing}
          onClose={() => setEditing(null)}
          onSubmit={onUpdate}
        />
      )}
    </div>
  )
}

// 渲染页码按钮：始终显示首页、末页、当前页前后 2 页，其余用省略号
function renderPageButtons(
  current: number,
  total: number,
  setPage: (p: number) => void,
) {
  const buttons: (number | '...')[] = []
  const around = 2
  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= current - around && i <= current + around)
    ) {
      buttons.push(i)
    } else if (buttons[buttons.length - 1] !== '...') {
      buttons.push('...')
    }
  }
  return buttons.map((b, idx) => {
    if (b === '...') {
      return (
        <span key={`e${idx}`} className="text-slate-400 text-xs px-1.5 select-none">
          …
        </span>
      )
    }
    return (
      <button
        key={b}
        onClick={() => setPage(b)}
        className={
          b === current
            ? 'btn-primary text-xs py-1 px-2.5'
            : 'btn-ghost border border-slate-200 text-xs py-1 px-2.5'
        }
      >
        {b}
      </button>
    )
  })
}

// ===== 新增/编辑学员弹窗（共用） =====
interface StudentEditModalProps {
  student?: Student // 有值 = 编辑模式；无值 = 新增模式
  onClose: () => void
  onSubmit: (student: Student) => Promise<boolean>
}

// 生成简易唯一 id：时间戳+随机串，前端预生成，后端会校验重复
function genStudentId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `stu_${ts}${rand}`
}

function StudentEditModal({ student, onClose, onSubmit }: StudentEditModalProps) {
  const isEdit = !!student
  const [form, setForm] = useState<Student>(
    student || {
      id: genStudentId(),
      name: '',
      phone: '',
      grade: '',
    },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field: keyof Student, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    setError('')
  }

  const handleSave = async () => {
    setError('')
    if (!form.name.trim()) {
      setError('学员姓名不能为空')
      return
    }
    if (!form.id.trim()) {
      setError('学员 ID 不能为空')
      return
    }
    if (form.phone && !/^[0-9+\-\s]{6,20}$/.test(form.phone.trim())) {
      setError('电话格式不正确')
      return
    }

    // 课时校验：选填，需为非负整数
    const hoursRaw = (form.hours ?? '') as number | string
    if (hoursRaw !== '' && hoursRaw !== undefined && hoursRaw !== null) {
      const n = Number(hoursRaw)
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setError('总课时需为非负整数')
        return
      }
    }
    if (isEdit && form.remainingHours !== undefined && form.remainingHours !== ('' as any)) {
      const r = Number(form.remainingHours)
      if (!Number.isFinite(r) || r < 0 || !Number.isInteger(r)) {
        setError('剩余课时需为非负整数')
        return
      }
    }

    setSaving(true)
    // 课时字段处理：
    // - 新增：设置 hours，remainingHours = hours
    // - 编辑：显式 remainingHours 用之；否则后端按 hours 差值自动调整
    const finalStudent: Student = {
      id: form.id.trim(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      grade: form.grade.trim(),
    }
    const hoursVal =
      form.hours !== undefined && form.hours !== null && (form.hours as any) !== ''
        ? Number(form.hours)
        : undefined
    if (hoursVal !== undefined) {
      finalStudent.hours = hoursVal
      if (!isEdit) {
        finalStudent.remainingHours = hoursVal
      } else if (
        form.remainingHours !== undefined &&
        form.remainingHours !== null &&
        (form.remainingHours as any) !== ''
      ) {
        finalStudent.remainingHours = Number(form.remainingHours)
      }
      // 编辑时若未显式传 remainingHours，后端按差值调整
    }

    const ok = await onSubmit(finalStudent)
    setSaving(false)
    if (ok) {
      onClose()
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-semibold text-base text-slate-800">
            {isEdit ? '编辑学员' : '新增学员'}
          </h3>
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
          {/* 必填说明 */}
          <div className="text-xs text-slate-400">
            <span className="text-rose-500">*</span> 为必填项
            {isEdit && <span className="ml-2">ID 不可修改</span>}
          </div>

          {/* 姓名 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
              <span className="text-rose-500 mr-0.5">*</span>姓名
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={inputClass}
              placeholder="如：张伟"
              autoFocus
            />
          </div>

          {/* ID */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">ID</span>
            <div className="flex-1 space-y-1">
              <input
                type="text"
                value={form.id}
                onChange={(e) => handleChange('id', e.target.value)}
                className={cn(inputClass, 'font-mono')}
                disabled={isEdit}
                placeholder="留空将自动生成"
              />
              <div className="text-xs text-slate-400">
                {isEdit ? 'ID 不可修改' : '默认自动生成，可自定义；不可与已有 ID 重复'}
              </div>
            </div>
          </div>

          {/* 年级 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">年级</span>
            <input
              type="text"
              value={form.grade}
              onChange={(e) => handleChange('grade', e.target.value)}
              className={inputClass}
              placeholder="如：高三"
            />
          </div>

          {/* 电话 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">电话</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className={inputClass}
              placeholder="可选，如：13800001001"
            />
          </div>

          {/* 总课时 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">总课时</span>
            <div className="flex-1 space-y-1">
              <input
                type="number"
                min={0}
                step={1}
                value={form.hours ?? ''}
                onChange={(e) => handleChange('hours', e.target.value)}
                className={inputClass}
                placeholder="可选，如：40"
              />
              <div className="text-xs text-slate-400">
                {isEdit
                  ? '修改总课时后，剩余课时会按差额自动调整（如新增 10 节，剩余 +10）'
                  : '新增学员时，剩余课时 = 总课时'}
              </div>
            </div>
          </div>

          {/* 剩余课时（仅编辑模式可见，可手动校正） */}
          {isEdit && (
            <div className="flex items-start gap-4">
              <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">剩余课时</span>
              <div className="flex-1 space-y-1">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.remainingHours ?? ''}
                  onChange={(e) => handleChange('remainingHours', e.target.value)}
                  className={inputClass}
                  placeholder="留空则按总课时差额自动调整"
                />
                <div className="text-xs text-slate-400">
                  点名到课会自动扣减；如需手动校正可在此修改，留空则按总课时差额调整
                </div>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0">
          <button onClick={onClose} className="btn-ghost">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn('btn-primary', saving && 'opacity-50')}
          >
            {saving ? '保存中…' : isEdit ? '保存' : '新增'}
          </button>
        </div>
      </div>
    </div>
  )
}
