import { useEffect, useMemo, useState } from 'react'
import type { Student, EnrollmentSummary, GradeStatus, Grade } from '@/types'
import { cn } from '@/utils/cn'
import {
  Button,
  EmptyState,
  Field,
  Modal,
  ModalFooter,
  Pagination,
  SubPageHeader,
  inputClass,
  toast,
} from '@/components/ui'
import { addGrade, getSystemConfig } from '@/api/admin'

interface StudentAdminProps {
  students: Student[]
  grades: Grade[]
  // 学员报名汇总：studentId -> 汇总（由父级从 enrollment 聚合后传入）
  summaries: Record<string, EnrollmentSummary>
  busy: boolean
  onBack: () => void
  onDelete: (student: Student) => void
  onAdd: (student: Student) => Promise<boolean>
  onUpdate: (student: Student) => Promise<boolean>
  onGradesChange: () => Promise<void> | void // 快捷添加年级后刷新年级列表
}

const PAGE_SIZE = 10

export function StudentAdmin({ students, grades, summaries, busy, onBack, onDelete, onAdd, onUpdate, onGradesChange }: StudentAdminProps) {
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [search, setSearch] = useState('')
  // 续费预警阈值：从系统配置加载，剩余课时 ≤ 阈值标红
  const [renewalThreshold, setRenewalThreshold] = useState(4)

  useEffect(() => {
    getSystemConfig().then((result) => {
      if (result.code === 0 && typeof result.data?.renewalThreshold === 'number') {
        setRenewalThreshold(result.data.renewalThreshold)
      }
    }).catch(() => { /* 静默使用默认值 */ })
  }, [])

  // 按姓名搜索
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      (s.name || '').toLowerCase().includes(q),
    )
  }, [students, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // 当前页越界时回到最后一页（如删除后）
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  // 搜索变化时回到第一页
  useEffect(() => { setPage(1) }, [search])

  return (
    <div className="min-h-full bg-background">
      {/* 顶部栏 */}
      <SubPageHeader title={'学员管理'} onBack={onBack} count={students.length}>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={busy}>
          + {'新增学员'}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {students.length === 0 ? (
          <EmptyState
            title="暂无学员"
            description="点击下方按钮创建第一个学员档案"
            action={
              <Button variant="primary" onClick={() => setAdding(true)} disabled={busy}>
                + 新增第一个学员
              </Button>
            }
          />
        ) : (
          <section className="card p-5">
            {/* 搜索框 */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={'搜索学员姓名'}
                className={cn(inputClass, 'max-w-xs')}
              />
              <span className="text-xs text-muted-foreground/70 whitespace-nowrap">
                共 {filtered.length} 人
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'姓名'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'年级'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'报名课程'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'剩余课时'}</th>
                    <th className="text-right py-2 px-2 font-medium">{'操作'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-2.5 px-2 font-medium text-foreground">{s.name}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {s.grade || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap">
                        {(() => {
                          const sum = summaries[s.id]
                          if (!sum || sum.count === 0) {
                            return <span className="text-muted-foreground/40">—</span>
                          }
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-brand-700 text-xs font-medium">
                                {sum.count} 门
                              </span>
                              {sum.giftHours > 0 && (
                                <span className="text-xs text-amber-600">{'含赠'} {sum.giftHours}</span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap">
                        {(() => {
                          const sum = summaries[s.id]
                          if (!sum || sum.count === 0) {
                            return <span className="text-muted-foreground/40">—</span>
                          }
                          const remaining = sum.remainingHours
                          const total = sum.purchasedHours + sum.giftHours
                          // 续费预警：剩余 ≤ 阈值（且 > 0）标橙，=0 标红
                          const isWarning = remaining > 0 && remaining <= renewalThreshold
                          return (
                            <span>
                              <span
                                className={
                                  remaining === 0
                                    ? 'text-destructive font-medium'
                                    : isWarning
                                      ? 'text-amber-600 font-medium'
                                      : 'text-foreground font-medium'
                                }
                              >
                                {remaining}
                              </span>
                              <span className="text-muted-foreground/70"> / {total}</span>
                              {remaining === 0 && (
                                <span className="ml-1 text-xs text-destructive">{'已用完'}</span>
                              )}
                              {isWarning && (
                                <span className="ml-1 text-xs text-amber-500" title={`剩余 ≤ ${renewalThreshold}，建议续费`}>{'需续费'}</span>
                              )}
                              {sum.remainingGiftHours > 0 && (
                                <span className="ml-1 text-xs text-amber-600">
                                  ({'赠'} {sum.remainingGiftHours})
                                </span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(s)}
                          disabled={busy}
                          className="text-primary hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          {'编辑'}
                        </button>
                        <button
                          onClick={() => onDelete(s)}
                          disabled={busy}
                          className="text-destructive hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          {'删除'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={students.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>
        )}
      </main>

      {/* 新增学员弹窗 */}
      {adding && (
        <StudentEditModal
          grades={grades}
          onGradesChange={onGradesChange}
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      )}

      {/* 编辑学员弹窗 */}
      {editing && (
        <StudentEditModal
          student={editing}
          grades={grades}
          onGradesChange={onGradesChange}
          onClose={() => setEditing(null)}
          onSubmit={onUpdate}
        />
      )}
    </div>
  )
}

// ===== 新增/编辑学员弹窗（共用） =====
interface StudentEditModalProps {
  student?: Student // 有值 = 编辑模式；无值 = 新增模式
  grades: Grade[]
  onGradesChange: () => Promise<void> | void
  onClose: () => void
  onSubmit: (student: Student) => Promise<boolean>
}

// 表单状态：所有字段统一为字符串，便于受控输入；status 收敛为合法枚举值
interface StudentFormState {
  id: string
  name: string
  grade: string
  phone: string
  parentName: string
  gender: string
  birthday: string
  tags: string
  remark: string
  source: string
}

function StudentEditModal({ student, grades, onGradesChange, onClose, onSubmit }: StudentEditModalProps) {
  const isEdit = !!student
  const [form, setForm] = useState<StudentFormState>(
    student
      ? {
          id: student.id,
          name: student.name,
          grade: student.grade || '',
          phone: student.phone || '',
          parentName: student.parentName || '',
          gender: student.gender || '',
          birthday: student.birthday || '',
          tags: student.tags || '',
          remark: student.remark || '',
          source: student.source || '',
        }
      : {
          // 新增模式：id 留空，由后端生成并回填
          id: '',
          name: '',
          grade: '',
          phone: '',
          parentName: '',
          gender: '',
          birthday: '',
          tags: '',
          remark: '',
          source: '',
        },
  )
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [gradeError, setGradeError] = useState('')
  // 快捷添加年级：不离开当前弹窗即时新增年级并选中
  const [quickAdding, setQuickAdding] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)

  // 局部更新表单，同时清除姓名字段的错误
  const update = (patch: Partial<StudentFormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    if ('name' in patch) setNameError('')
    if ('phone' in patch) setPhoneError('')
    if ('grade' in patch) setGradeError('')
  }

  // 快捷添加年级：调 addGrade，成功后刷新父级年级列表并自动选中新年级
  const handleQuickAddGrade = async () => {
    const name = quickName.trim()
    if (!name) return
    setQuickSaving(true)
    try {
      const result = await addGrade({ name, sortOrder: 0, status: 'active' as GradeStatus, description: '' })
      if (result.code === 0) {
        toast.success(`年级「${name}」已添加`)
        // 等待父级刷新年级列表完成后再选中，避免年级管理中看不到新数据
        await onGradesChange()
        update({ grade: name })
        setQuickName('')
        setQuickAdding(false)
      } else if (result.code === 409) {
        toast.error('年级名称已存在')
      } else {
        toast.error(result.message || '添加失败')
      }
    } catch (e) {
      toast.error('添加失败：' + (e as Error).message)
    } finally {
      setQuickSaving(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setNameError('学员姓名不能为空')
      return
    }
    if (!form.phone || !form.phone.trim()) {
      setPhoneError('请填写手机号')
      return
    }
    if (!form.grade || !form.grade.trim()) {
      setGradeError('请选择年级')
      return
    }

    setSaving(true)
    // id：新增模式传空串（后端自动生成并回填）；编辑模式保留原 id
    // 课时由「报名管理」按课程独立维护，此处不涉及
    const finalStudent: Student = {
      id: form.id,
      name: form.name.trim(),
      grade: form.grade.trim(),
      phone: form.phone.trim(),
      parentName: form.parentName.trim(),
      gender: form.gender,
      birthday: form.birthday,
      status: 'active',
      tags: form.tags.trim(),
      remark: form.remark.trim(),
      source: form.source.trim(),
    }

    const ok = await onSubmit(finalStudent)
    setSaving(false)
    if (ok) {
      onClose()
    }
  }

  return (
    <Modal
      title={isEdit ? '编辑学员' : '新增学员'}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          loading={saving}
          confirmText={isEdit ? '保存' : '新增'}
        />
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <Field label={'姓名'} required error={nameError}>
          <input
            type="text"
            className={inputClass}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={'如：张伟'}
            autoFocus
          />
        </Field>

        <Field label={'年级'} required hint={'如：高三'} error={gradeError}>
          {quickAdding ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                className={inputClass}
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder={'如：三年级、初一'}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleQuickAddGrade() }
                  if (e.key === 'Escape') { setQuickAdding(false); setQuickName('') }
                }}
                maxLength={32}
              />
              <button
                type="button"
                onClick={handleQuickAddGrade}
                disabled={quickSaving || !quickName.trim()}
                className="btn-primary whitespace-nowrap text-xs px-3 py-2 disabled:opacity-50"
              >
                {quickSaving ? '...' : '新增'}
              </button>
              <button
                type="button"
                onClick={() => { setQuickAdding(false); setQuickName('') }}
                className="btn-ghost text-xs px-2 py-2"
              >
                {'取消'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                className={inputClass}
                value={form.grade}
                onChange={(e) => update({ grade: e.target.value })}
              >
                <option value="">{'请选择年级'}</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.name}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setQuickAdding(true)}
                className="btn-ghost whitespace-nowrap text-xs px-3 py-2"
                title={'快捷添加年级'}
              >
                + {'快捷添加年级'}
              </button>
            </div>
          )}
          {/* 兜底：若学员年级不在年级列表中（历史数据），仍显示出来便于编辑 */}
          {form.grade && !grades.some((g) => g.name === form.grade) && !quickAdding && (
            <p className="text-xs text-amber-600 mt-1">当前年级「{form.grade}」不在年级列表中，可重新选择或去年级管理维护</p>
          )}
        </Field>

        <Field label={'手机'} required error={phoneError}>
          <input
            type="text"
            className={inputClass}
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder={'如：13800000000'}
          />
        </Field>

        <Field label={'家长姓名'}>
          <input
            type="text"
            className={inputClass}
            value={form.parentName}
            onChange={(e) => update({ parentName: e.target.value })}
            placeholder={'如：张父'}
          />
        </Field>

        <Field label={'性别'}>
          <select
            className={inputClass}
            value={form.gender}
            onChange={(e) => update({ gender: e.target.value })}
          >
            <option value="">{'未设置'}</option>
            <option value="男">{'男'}</option>
            <option value="女">{'女'}</option>
          </select>
        </Field>

        <Field label={'生日'}>
          <input
            type="date"
            className={inputClass}
            value={form.birthday}
            onChange={(e) => update({ birthday: e.target.value })}
          />
        </Field>

        <Field label={'来源'} hint={'如：转介绍 / 地推 / 线上'}>
          <input
            type="text"
            className={inputClass}
            value={form.source}
            onChange={(e) => update({ source: e.target.value })}
            placeholder={'如：转介绍'}
          />
        </Field>

        <Field label={'标签'} hint={'多个标签用逗号分隔'} className="sm:col-span-2">
          <input
            type="text"
            className={inputClass}
            value={form.tags}
            onChange={(e) => update({ tags: e.target.value })}
            placeholder={'如：续费意向, VIP'}
          />
        </Field>

        <Field label={'备注'} className="sm:col-span-2">
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={form.remark}
            onChange={(e) => update({ remark: e.target.value })}
            placeholder={'选填'}
          />
        </Field>
      </div>
    </Modal>
  )
}
