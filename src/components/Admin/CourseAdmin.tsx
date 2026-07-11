import { useMemo, useState } from 'react'
import type { Course, BillingType, CourseStatus, Grade } from '@/types'
import { cn } from '@/utils/cn'
import { COURSE_COLOR_OPTIONS, getCourseDotClass } from '@/utils/courseColors'
import {
  Button,
  EmptyState,
  Field,
  Modal,
  ModalFooter,
  Pagination,
  SubPageHeader,
  inputClass,
} from '@/components/ui'

interface CourseAdminProps {
  courses: Course[]
  grades: Grade[]
  busy: boolean
  onBack: () => void
  onDelete: (course: Course) => void
  onAdd: (course: Course) => Promise<boolean>
  onUpdate: (course: Course) => Promise<boolean>
}

const PAGE_SIZE = 15

export function CourseAdmin({ courses, grades, busy, onBack, onDelete, onAdd, onUpdate }: CourseAdminProps) {
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  const totalPages = Math.max(1, Math.ceil(courses.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return courses.slice(start, start + PAGE_SIZE)
  }, [courses, safePage])

  return (
    <div className="min-h-full bg-background">
      <SubPageHeader title={'课程管理'} onBack={onBack} count={courses.length}>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={busy}>
          + {'新增课程'}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {courses.length === 0 ? (
          <EmptyState
            title="暂无课程"
            description="新增课程后，可在排课管理中按课程批量排课"
            action={
              <Button variant="primary" onClick={() => setAdding(true)} disabled={busy}>
                + 新增第一个课程
              </Button>
            }
          />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'颜色'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'课程名称'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'年级'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'计费'}</th>
                    <th className="text-right py-2 px-2 font-medium">{'操作'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-2.5 px-2">
                        <span
                          className={cn(
                            'inline-block w-4 h-4 rounded-full',
                            getCourseDotClass(c.color),
                          )}
                        />
                      </td>
                      <td className="py-2.5 px-2 font-medium text-foreground">{c.name}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {c.grade || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground text-xs">
                        {c.billingType === 'per_term' ? '按期' : c.billingType === 'per_month' ? '按月' : '按课时'}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(c)}
                          disabled={busy}
                          className="text-primary hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          {'编辑'}
                        </button>
                        <button
                          onClick={() => onDelete(c)}
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

            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={courses.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>
        )}
      </main>

      {/* 新增弹窗 */}
      {adding && (
        <CourseEditModal
          grades={grades}
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      )}

      {/* 编辑弹窗 */}
      {editing && (
        <CourseEditModal
          course={editing}
          grades={grades}
          onClose={() => setEditing(null)}
          onSubmit={onUpdate}
        />
      )}
    </div>
  )
}

// ===== 新增/编辑课程弹窗 =====
interface CourseEditModalProps {
  course?: Course // 有值 = 编辑模式；无值 = 新增模式
  grades: Grade[]
  onClose: () => void
  onSubmit: (course: Course) => Promise<boolean>
}

function CourseEditModal({ course, grades, onClose, onSubmit }: CourseEditModalProps) {
  const isEdit = !!course
  const [form, setForm] = useState<Course>(
    course
      ? {
          ...course,
          billingType: course.billingType || 'per_lesson',
          status: course.status || 'active',
          term: course.term || '',
          category: course.category || '',
          grade: course.grade || '',
          description: course.description || '',
        }
      : {
          // 新增模式：id 留空，由后端生成回填
          id: '',
          name: '',
          color: 'blue',
          billingType: 'per_lesson',
          status: 'active',
          term: '',
          category: '',
          grade: '',
          description: '',
        },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // 局部更新表单，同时清除对应字段的错误
  const update = (patch: Partial<Course>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }

  // 计费方式：从 select 字符串收敛到联合类型
  const setBillingType = (value: string) => {
    if (value === 'per_lesson' || value === 'per_term' || value === 'per_month') {
      update({ billingType: value })
    }
  }

  // 状态：从 select 字符串收敛到联合类型
  const setStatus = (value: string) => {
    if (value === 'active' || value === 'inactive') {
      update({ status: value })
    }
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) {
      e.name = '课程名称不能为空'
    }
    if (!form.grade) {
      e.grade = '请选择年级'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    const finalCourse: Course = {
      id: form.id.trim(),
      name: form.name.trim(),
      color: form.color || '',
      billingType: (form.billingType || 'per_lesson') as BillingType,
      term: (form.term || '').trim(),
      status: (form.status || 'active') as CourseStatus,
      category: (form.category || '').trim(),
      grade: (form.grade || '').trim(),
      description: (form.description || '').trim(),
    }
    const ok = await onSubmit(finalCourse)
    setSaving(false)
    if (ok) {
      onClose()
    }
  }

  return (
    <Modal
      title={isEdit ? '编辑课程' : '新增课程'}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          loading={saving}
          confirmText={isEdit ? '保存' : '新增'}
        />
      }
    >
      <div className="space-y-4">
        {/* 课程名称 */}
        <Field label={'课程名称'} required error={errors.name}>
          <input
            type="text"
            className={inputClass}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="如：数学提高班"
            autoFocus
          />
        </Field>

        {/* 颜色标签 */}
        <Field label="颜色标签">
          <div className="flex flex-wrap gap-2">
            {COURSE_COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => update({ color: opt.key })}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all',
                  form.color === opt.key
                    ? 'border-slate-400 bg-background ring-1 ring-slate-300'
                    : 'border-border hover:border-border',
                )}
              >
                <span className={cn('inline-block w-3 h-3 rounded-full', opt.dot)} />
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 计费方式 */}
        <Field label="计费方式">
          <select
            className={inputClass}
            value={form.billingType || 'per_lesson'}
            onChange={(e) => setBillingType(e.target.value)}
          >
            <option value="per_lesson">按课时（点名扣减）</option>
            <option value="per_term">按期（整期收费）</option>
            <option value="per_month">按月（包月收费）</option>
          </select>
        </Field>

        {/* 学期 */}
        <Field label={'学期'} hint="如：2024春季">
          <input
            type="text"
            className={inputClass}
            value={form.term || ''}
            onChange={(e) => update({ term: e.target.value })}
            placeholder="如：2024春季"
          />
        </Field>

        {/* 状态 */}
        <Field label={'状态'}>
          <select
            className={inputClass}
            value={form.status || 'active'}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">{'启用'}</option>
            <option value="inactive">{'停用'}</option>
          </select>
        </Field>

        {/* 分类 */}
        <Field label={'分类'} hint="如：数学/英语/物理">
          <input
            type="text"
            className={inputClass}
            value={form.category || ''}
            onChange={(e) => update({ category: e.target.value })}
            placeholder="如：数学"
          />
        </Field>

        {/* 关联年级：报名时按学员年级过滤可选课程 */}
        <Field label={'年级'} required error={errors.grade} hint="年级为必选项">
          <select
            className={inputClass}
            value={form.grade || ''}
            onChange={(e) => update({ grade: e.target.value })}
          >
            <option value="">{'请选择年级'}</option>
            {grades.map((g) => (
              <option key={g.id} value={g.name}>{g.name}</option>
            ))}
          </select>
          {form.grade && !grades.some((g) => g.name === form.grade) && (
            <p className="text-xs text-amber-600 mt-1">当前年级「{form.grade}」不在年级列表中，可重新选择</p>
          )}
        </Field>

        {/* 描述 */}
        <Field label={'描述'}>
          <textarea
            className={cn(inputClass, 'min-h-[72px] resize-y')}
            value={form.description || ''}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="课程简介、适合人群等"
            rows={3}
          />
        </Field>
      </div>
    </Modal>
  )
}
