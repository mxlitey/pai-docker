import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course, BillingType, CourseStatus } from '@/types'
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
  busy: boolean
  onBack: () => void
  onDelete: (course: Course) => void
  onAdd: (course: Course) => Promise<boolean>
  onUpdate: (course: Course) => Promise<boolean>
}

const PAGE_SIZE = 15

export function CourseAdmin({ courses, busy, onBack, onDelete, onAdd, onUpdate }: CourseAdminProps) {
  const { t } = useTranslation()
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
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={t('course.title')} onBack={onBack} count={courses.length}>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={busy}>
          + {t('course.addCourse')}
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
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{t('course.color')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('course.courseName')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('course.teacher')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('course.location')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('course.defaultTime')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('course.unitPrice')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('course.billing')}</th>
                    <th className="text-left py-2 px-2 font-medium">ID</th>
                    <th className="text-right py-2 px-2 font-medium">{t('common.operation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2">
                        <span
                          className={cn(
                            'inline-block w-4 h-4 rounded-full',
                            getCourseDotClass(c.color),
                          )}
                        />
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-700">{c.name}</td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {c.teacher || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {c.location || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 text-xs">
                        {c.defaultStartTime || c.defaultEndTime
                          ? `${c.defaultStartTime || '--'} - ${c.defaultEndTime || '--'}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {c.unitPrice && c.unitPrice > 0 ? (
                          <span className="text-slate-700 font-medium">¥{c.unitPrice}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 text-xs">
                        {c.billingType === 'per_term' ? t('course.billingPerTerm') : c.billingType === 'per_month' ? t('course.billingPerMonth') : t('course.billingPerLesson')}
                      </td>
                      <td className="py-2.5 px-2 text-slate-500 font-mono text-xs">{c.id}</td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(c)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => onDelete(c)}
                          disabled={busy}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          {t('common.delete')}
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
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      )}

      {/* 编辑弹窗 */}
      {editing && (
        <CourseEditModal
          course={editing}
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
  onClose: () => void
  onSubmit: (course: Course) => Promise<boolean>
}

// 时间选择：原生 type="time"，值为 "HH:mm" 或空串
// 分钟以 5 分钟为单位（step=300 秒），避免双 select 半选丢值问题

function CourseEditModal({ course, onClose, onSubmit }: CourseEditModalProps) {
  const { t } = useTranslation()
  const isEdit = !!course
  const [form, setForm] = useState<Course>(
    course
      ? {
          ...course,
          unitPrice: course.unitPrice ?? 0,
          billingType: course.billingType || 'per_lesson',
          capacity: course.capacity ?? 0,
          status: course.status || 'active',
          term: course.term || '',
          category: course.category || '',
          description: course.description || '',
        }
      : {
          // 新增模式：id 留空，由后端生成回填
          id: '',
          name: '',
          teacher: '',
          location: '',
          color: 'blue',
          defaultStartTime: '',
          defaultEndTime: '',
          unitPrice: 0,
          billingType: 'per_lesson',
          capacity: 0,
          status: 'active',
          term: '',
          category: '',
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
      // 时间字段错误统一挂在 time 上
      if (patch.defaultStartTime !== undefined || patch.defaultEndTime !== undefined) {
        delete next.time
      }
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
      e.name = t('course.nameRequired')
    }
    if (form.defaultStartTime && !/^\d{2}:\d{2}$/.test(form.defaultStartTime)) {
      e.time = t('course.timeIncomplete')
    }
    if (form.defaultEndTime && !/^\d{2}:\d{2}$/.test(form.defaultEndTime)) {
      e.time = t('course.timeIncomplete')
    }
    const unitPriceNum = Number(form.unitPrice)
    if (!Number.isFinite(unitPriceNum) || unitPriceNum < 0) {
      e.unitPrice = t('course.unitPriceInvalid')
    }
    const capacityNum = Number(form.capacity)
    if (!Number.isFinite(capacityNum) || capacityNum < 0) {
      e.capacity = '容量需为非负数'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    const finalCourse: Course = {
      // 新增模式 id 为空串，由后端生成回填；编辑模式保留原 id
      id: form.id.trim(),
      name: form.name.trim(),
      teacher: (form.teacher || '').trim(),
      location: (form.location || '').trim(),
      color: form.color || '',
      defaultStartTime: form.defaultStartTime || '',
      defaultEndTime: form.defaultEndTime || '',
      unitPrice: Number(form.unitPrice),
      billingType: (form.billingType || 'per_lesson') as BillingType,
      capacity: Number(form.capacity),
      term: (form.term || '').trim(),
      status: (form.status || 'active') as CourseStatus,
      category: (form.category || '').trim(),
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
      title={isEdit ? t('course.editCourse') : t('course.addCourse')}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          loading={saving}
          confirmText={isEdit ? t('common.save') : t('common.add')}
        />
      }
    >
      <div className="space-y-4">
        {/* 课程名称 */}
        <Field label={t('course.courseName')} required error={errors.name}>
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
                    ? 'border-slate-400 bg-slate-50 ring-1 ring-slate-300'
                    : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <span className={cn('inline-block w-3 h-3 rounded-full', opt.dot)} />
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 教师 */}
        <Field label={t('course.teacher')}>
          <input
            type="text"
            className={inputClass}
            value={form.teacher || ''}
            onChange={(e) => update({ teacher: e.target.value })}
            placeholder="如：张老师"
          />
        </Field>

        {/* 地点 */}
        <Field label={t('course.location')}>
          <input
            type="text"
            className={inputClass}
            value={form.location || ''}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="如：A教室201"
          />
        </Field>

        {/* 默认时间：原生 type="time"，5 分钟刻度 */}
        <Field label={t('course.defaultTime')} error={errors.time} hint="分钟以 5 分钟为单位">
          <div className="flex items-center gap-2">
            <input
              type="time"
              step={300}
              value={form.defaultStartTime || ''}
              onChange={(e) => update({ defaultStartTime: e.target.value })}
              className={cn(inputClass, 'bg-white w-32')}
            />
            <span className="text-slate-400 px-1">-</span>
            <input
              type="time"
              step={300}
              value={form.defaultEndTime || ''}
              onChange={(e) => update({ defaultEndTime: e.target.value })}
              className={cn(inputClass, 'bg-white w-32')}
            />
          </div>
        </Field>

        {/* 单价 */}
        <Field
          label={t('course.unitPrice')}
          error={errors.unitPrice}
          hint="报名时按此单价计费；可填 0 表示免费"
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">¥</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.unitPrice ?? 0}
              onChange={(e) => update({ unitPrice: Number(e.target.value) })}
              className={inputClass}
              placeholder="每课时单价，如 200"
            />
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

        {/* 容量 */}
        <Field label={t('course.capacity')} error={errors.capacity} hint="课程最大容纳人数">
          <input
            type="number"
            min={0}
            value={form.capacity ?? 0}
            onChange={(e) => update({ capacity: Number(e.target.value) })}
            className={inputClass}
            placeholder="如 20"
          />
        </Field>

        {/* 学期 */}
        <Field label={t('course.term')} hint="如：2024春季">
          <input
            type="text"
            className={inputClass}
            value={form.term || ''}
            onChange={(e) => update({ term: e.target.value })}
            placeholder="如：2024春季"
          />
        </Field>

        {/* 状态 */}
        <Field label={t('common.status')}>
          <select
            className={inputClass}
            value={form.status || 'active'}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">{t('common.enable')}</option>
            <option value="inactive">{t('common.disable')}</option>
          </select>
        </Field>

        {/* 分类 */}
        <Field label={t('course.category')} hint="如：数学/英语/物理">
          <input
            type="text"
            className={inputClass}
            value={form.category || ''}
            onChange={(e) => update({ category: e.target.value })}
            placeholder="如：数学"
          />
        </Field>

        {/* 描述 */}
        <Field label={t('course.description')}>
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
