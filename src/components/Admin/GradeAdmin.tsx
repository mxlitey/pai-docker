// 年级管理：维护年级主数据，支持新增/编辑/删除/批量升班
// - 学员/课程通过 grade 文本字段（年级名称）关联，重命名时后端级联更新
// - 删除前检查是否仍被学员/课程引用，引用中则拒绝
// - 批量升班：把某年级所有学员整体迁到目标年级（学年末常用）
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course, Grade, GradeStatus, Student } from '@/types'
import {
  addGrade,
  deleteGrade,
  promoteGrade,
  updateGrade,
} from '@/api/admin'
import {
  Button,
  confirmDialog,
  EmptyState,
  Field,
  Modal,
  ModalFooter,
  SubPageHeader,
  inputClass,
  toast,
} from '@/components/ui'

interface GradeAdminProps {
  grades: Grade[]
  students: Student[]
  courses: Course[]
  busy: boolean // 父级全局忙碌，禁用按钮
  onBack: () => void
  onGradesChange: () => void // 年级列表变更后重新加载
  onStudentsChange: () => void // 升班后学员年级变更，重新加载学员列表
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

export function GradeAdmin({
  grades,
  students,
  courses,
  busy,
  onBack,
  onGradesChange,
  onStudentsChange,
  showToast,
}: GradeAdminProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Grade | null>(null)
  const [promoting, setPromoting] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)

  const actionDisabled = busy || localBusy

  // 按年级名称统计学员数与课程数
  const studentCountByGrade = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of students) {
      const g = (s.grade || '').trim()
      if (!g) continue
      m.set(g, (m.get(g) || 0) + 1)
    }
    return m
  }, [students])

  const courseCountByGrade = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of courses) {
      const g = (c.grade || '').trim()
      if (!g) continue
      m.set(g, (m.get(g) || 0) + 1)
    }
    return m
  }, [courses])

  const handleDelete = (grade: Grade) => {
    const studentCount = studentCountByGrade.get(grade.name) || 0
    const courseCount = courseCountByGrade.get(grade.name) || 0
    if (studentCount > 0 || courseCount > 0) {
      toast.error(t('grade.deleteInUse', { student: studentCount, course: courseCount }))
      return
    }
    confirmDialog({
      title: t('grade.deleteTitle'),
      message: t('grade.deleteMessage', { name: grade.name }),
      danger: true,
      onConfirm: async () => {
        setLocalBusy(true)
        try {
          const result = await deleteGrade(grade.id)
          if (result.code === 0) {
            toast.success(result.message)
            onGradesChange()
          } else if (result.code === 409 && result.data?.inUse) {
            toast.error(t('grade.deleteInUse', {
              student: result.data.studentCount,
              course: result.data.courseCount,
            }))
          } else {
            toast.error(result.message || '删除失败')
          }
        } catch (e) {
          showToast('error', '删除失败：' + (e as Error).message)
        } finally {
          setLocalBusy(false)
        }
      },
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={t('grade.title')} onBack={onBack} count={grades.length}>
        <Button variant="outline" onClick={() => setPromoting(true)} disabled={actionDisabled || grades.length < 2}>
          {t('grade.promote')}
        </Button>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={actionDisabled}>
          + {t('grade.addGrade')}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {grades.length === 0 ? (
          <EmptyState
            title={t('grade.empty')}
            description="年级用于学员分班与课程归类，建议先创建常用年级"
            action={
              <Button variant="primary" onClick={() => setAdding(true)} disabled={actionDisabled}>
                + {t('grade.addGrade')}
              </Button>
            }
          />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{t('grade.name')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('grade.sortOrder')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('grade.status')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('grade.studentCount')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('grade.courseCount')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('grade.description')}</th>
                    <th className="text-right py-2 px-2 font-medium">{t('common.operation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) => {
                    const studentCount = studentCountByGrade.get(g.name) || 0
                    const courseCount = courseCountByGrade.get(g.name) || 0
                    return (
                      <tr key={g.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-2 font-medium text-slate-700">{g.name}</td>
                        <td className="py-2.5 px-2 text-slate-600">{g.sortOrder ?? 0}</td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            g.status === 'inactive'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-green-50 text-green-700'
                          }`}>
                            {g.status === 'inactive' ? t('grade.statusInactive') : t('grade.statusActive')}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-600">{studentCount}</td>
                        <td className="py-2.5 px-2 text-slate-600">{courseCount}</td>
                        <td className="py-2.5 px-2 text-slate-500 max-w-xs truncate">
                          {g.description || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditing(g)}
                            disabled={actionDisabled}
                            className="text-brand-600 hover:text-brand-700 text-xs font-medium disabled:opacity-50 mr-3"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleDelete(g)}
                            disabled={actionDisabled}
                            className="text-rose-500 hover:text-rose-600 text-xs font-medium disabled:opacity-50"
                          >
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {(adding || editing) && (
        <GradeEditModal
          grade={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); onGradesChange() }}
          showToast={showToast}
        />
      )}

      {promoting && (
        <PromoteModal
          grades={grades}
          onClose={() => setPromoting(false)}
          onDone={() => { setPromoting(false); onGradesChange(); onStudentsChange() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ===== 新增/编辑年级弹窗 =====
interface GradeEditModalProps {
  grade?: Grade | null
  onClose: () => void
  onSaved: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

interface GradeFormState {
  id: string
  name: string
  sortOrder: string
  status: GradeStatus
  description: string
}

function GradeEditModal({ grade, onClose, onSaved, showToast }: GradeEditModalProps) {
  const { t } = useTranslation()
  const isEdit = !!grade
  const [form, setForm] = useState<GradeFormState>(
    grade
      ? {
          id: grade.id,
          name: grade.name,
          sortOrder: String(grade.sortOrder ?? 0),
          status: grade.status || 'active',
          description: grade.description || '',
        }
      : { id: '', name: '', sortOrder: '0', status: 'active', description: '' },
  )
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  const update = (patch: Partial<GradeFormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    if ('name' in patch) setNameError('')
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setNameError(t('grade.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        id: form.id,
        name: form.name.trim(),
        sortOrder: Number(form.sortOrder || 0),
        status: form.status,
        description: form.description.trim(),
      }
      const result = isEdit ? await updateGrade(payload) : await addGrade(payload)
      if (result.code === 0) {
        toast.success(result.message)
        onSaved()
      } else if (result.code === 409) {
        setNameError(t('grade.duplicateName'))
      } else {
        showToast('error', result.message || '保存失败')
      }
    } catch (e) {
      showToast('error', '保存失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? t('grade.editGrade') : t('grade.addGrade')}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          loading={saving}
          confirmText={isEdit ? t('common.save') : t('common.add')}
        />
      }
    >
      <div className="space-y-4">
        <Field label={t('grade.name')} required error={nameError}>
          <input
            type="text"
            className={inputClass}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={t('grade.namePlaceholder')}
            autoFocus
            maxLength={32}
          />
        </Field>
        <Field label={t('grade.sortOrder')} hint={t('grade.sortOrderHint')}>
          <input
            type="number"
            className={inputClass}
            value={form.sortOrder}
            onChange={(e) => update({ sortOrder: e.target.value })}
            placeholder="0"
          />
        </Field>
        <Field label={t('grade.status')}>
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => update({ status: e.target.value as GradeStatus })}
          >
            <option value="active">{t('grade.statusActive')}</option>
            <option value="inactive">{t('grade.statusInactive')}</option>
          </select>
        </Field>
        <Field label={t('grade.description')}>
          <textarea
            className={inputClass}
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            rows={2}
            maxLength={200}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ===== 批量升班弹窗 =====
interface PromoteModalProps {
  grades: Grade[]
  onClose: () => void
  onDone: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

function PromoteModal({ grades, onClose, onDone, showToast }: PromoteModalProps) {
  const { t } = useTranslation()
  const activeGrades = grades.filter((g) => g.status !== 'inactive')
  const [fromGradeName, setFromGradeName] = useState(activeGrades[0]?.name || '')
  const [toGradeName, setToGradeName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handlePromote = async () => {
    if (!fromGradeName || !toGradeName) {
      setError(t('grade.nameRequired'))
      return
    }
    if (fromGradeName === toGradeName) {
      setError(t('grade.promoteFrom') + ' ≠ ' + t('grade.promoteTo'))
      return
    }
    setSaving(true)
    try {
      const result = await promoteGrade(fromGradeName, toGradeName)
      if (result.code === 0) {
        toast.success(t('grade.promoteSuccess', {
          count: result.data.promoted,
          from: fromGradeName,
          to: toGradeName,
        }))
        onDone()
      } else {
        showToast('error', result.message || '升班失败')
      }
    } catch (e) {
      showToast('error', '升班失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('grade.promoteTitle')}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handlePromote}
          loading={saving}
          confirmText={t('grade.promote')}
          confirmDisabled={!fromGradeName || !toGradeName || fromGradeName === toGradeName}
        />
      }
    >
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 text-xs text-amber-700 leading-relaxed">
          批量升班会把这个年级的所有学员年级更新为目标年级。仅影响学员年级字段，不会自动迁移已有报名或排课。
          学年末常用：例如把「三年级」整体升到「四年级」。
        </div>
        <Field label={t('grade.promoteFrom')} required>
          <select
            className={inputClass}
            value={fromGradeName}
            onChange={(e) => { setFromGradeName(e.target.value); setError('') }}
          >
            <option value="">{t('grade.selectGrade')}</option>
            {activeGrades.map((g) => (
              <option key={g.id} value={g.name}>{g.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('grade.promoteTo')} required>
          <select
            className={inputClass}
            value={toGradeName}
            onChange={(e) => { setToGradeName(e.target.value); setError('') }}
          >
            <option value="">{t('grade.selectGrade')}</option>
            {activeGrades.map((g) => (
              <option key={g.id} value={g.name}>{g.name}</option>
            ))}
          </select>
        </Field>
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
