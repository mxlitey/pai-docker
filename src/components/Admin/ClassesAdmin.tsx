// 班级管理：维护班级主数据（人的集合 + 关联课程 + 教师 + 默认时间地点），排课以班级为单位
// - 进入时调 listClasses() 加载班级列表（带成员数 + 关联课程名）
// - 新增/编辑班级：选课程后可自动带入教师/地点（仅当字段为空时，用户可改）
// - 删除班级：二次确认（要求输入班级名），仍有排课引用时后端拒绝并返回 scheduleCount
// - 成员管理：加载成员名单，支持批量添加（从学员库排除已是成员，支持搜索）/ 单个移除
import { useEffect, useMemo, useState } from 'react'
import type { ClassInfo, ClassMember, ClassStatus, Course, Student } from '@/types'
import {
  addClass,
  addClassMembers,
  deleteClass,
  getClassMembers,
  listClasses,
  removeClassMembers,
  updateClass,
} from '@/api/admin'
import { cn } from '@/utils/cn'
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

interface ClassesAdminProps {
  courses: Course[]
  students: Student[]
  busy: boolean // 父级全局忙碌，禁用按钮
  onBack: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

export function ClassesAdmin({ courses, students, busy, onBack, showToast }: ClassesAdminProps) {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ClassInfo | null>(null)
  const [managingMembers, setManagingMembers] = useState<ClassInfo | null>(null)
  const [localBusy, setLocalBusy] = useState(false)

  const actionDisabled = busy || localBusy

  // 进入时加载班级列表
  const loadClasses = async () => {
    setLoading(true)
    try {
      const result = await listClasses()
      if (result.code === 0) {
        setClasses(result.data?.classes || [])
      } else {
        showToast('error', result.message || '加载班级列表失败')
      }
    } catch (e) {
      showToast('error', '加载班级列表失败：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 按名称模糊搜索
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return classes
    return classes.filter((c) => (c.name || '').toLowerCase().includes(q))
  }, [classes, search])

  const handleDelete = async (cls: ClassInfo) => {
    const ok = await confirmDialog({
      title: '删除班级',
      message: `确认删除班级「${cls.name}」？\n该操作不可恢复，请输入班级名以确认。`,
      danger: true,
      requireText: cls.name,
    })
    if (!ok) return
    setLocalBusy(true)
    try {
      const result = await deleteClass(cls.id)
      if (result.code === 0) {
        toast.success(result.message || '已删除')
        loadClasses()
      } else if (result.data?.inUse) {
        showToast('error', `仍有 ${result.data?.scheduleCount ?? 0} 条排课引用，无法删除`)
      } else {
        showToast('error', result.message || '删除失败')
      }
    } catch (e) {
      showToast('error', '删除失败：' + (e as Error).message)
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={'班级管理'} onBack={onBack} count={classes.length}>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={actionDisabled}>
          + {'新增班级'}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="card p-10 text-center text-sm text-slate-400">{'加载中…'}</div>
        ) : classes.length === 0 ? (
          <EmptyState
            title={'暂无班级，请先新增'}
            description="班级是排课的单位，关联课程、教师与默认时间地点后可批量排课"
            action={
              <Button variant="primary" onClick={() => setAdding(true)} disabled={actionDisabled}>
                + {'新增班级'}
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
                placeholder={'搜索班级名称'}
                className={cn(inputClass, 'max-w-xs')}
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">
                共 {filtered.length} 个班级
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'班级名称'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'关联课程'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'教师'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'成员数'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'容量'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'状态'}</th>
                    <th className="text-right py-2 px-2 font-medium">{'操作'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {'无匹配的班级'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-2 font-medium text-slate-700">{c.name}</td>
                        <td className="py-2.5 px-2 text-slate-600">
                          {c.courseName || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600">
                          {c.teacher || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600">{c.memberCount ?? 0}</td>
                        <td className="py-2.5 px-2 text-slate-600">{c.capacity ?? 0}</td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            c.status === 'inactive'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-green-50 text-green-700'
                          }`}>
                            {c.status === 'inactive' ? '停用' : '启用'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditing(c)}
                            disabled={actionDisabled}
                            className="text-brand-600 hover:text-brand-700 text-xs font-medium disabled:opacity-50 mr-3"
                          >
                            {'编辑'}
                          </button>
                          <button
                            onClick={() => setManagingMembers(c)}
                            disabled={actionDisabled}
                            className="text-brand-600 hover:text-brand-700 text-xs font-medium disabled:opacity-50 mr-3"
                          >
                            {'成员'}
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            disabled={actionDisabled}
                            className="text-rose-500 hover:text-rose-600 text-xs font-medium disabled:opacity-50"
                          >
                            {'删除'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {(adding || editing) && (
        <ClassEditModal
          cls={editing}
          courses={courses}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); loadClasses() }}
          showToast={showToast}
        />
      )}

      {managingMembers && (
        <ClassMembersModal
          cls={managingMembers}
          students={students}
          onClose={() => setManagingMembers(null)}
          onMembersChanged={loadClasses}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ===== 新增/编辑班级弹窗 =====
interface ClassEditModalProps {
  cls?: ClassInfo | null
  courses: Course[]
  onClose: () => void
  onSaved: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

interface ClassFormState {
  id: string
  name: string
  courseId: string
  teacher: string
  location: string
  defaultStartTime: string
  defaultEndTime: string
  capacity: string // 字符串承载输入，保存时转 number
  status: ClassStatus
  remark: string
}

function ClassEditModal({ cls, courses, onClose, onSaved, showToast }: ClassEditModalProps) {
  const isEdit = !!cls
  const [form, setForm] = useState<ClassFormState>(
    cls
      ? {
          id: cls.id,
          name: cls.name,
          courseId: cls.courseId || '',
          teacher: cls.teacher || '',
          location: cls.location || '',
          defaultStartTime: cls.defaultStartTime || '',
          defaultEndTime: cls.defaultEndTime || '',
          capacity: String(cls.capacity ?? 0),
          status: cls.status || 'active',
          remark: cls.remark || '',
        }
      : {
          id: '',
          name: '',
          courseId: '',
          teacher: '',
          location: '',
          defaultStartTime: '',
          defaultEndTime: '',
          capacity: '0',
          status: 'active',
          remark: '',
        },
  )
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 局部更新表单，同时清除对应字段的错误
  const update = (patch: Partial<ClassFormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    if ('name' in patch) setNameError('')
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      if (patch.defaultStartTime !== undefined || patch.defaultEndTime !== undefined) {
        delete next.time
      }
      return next
    })
  }

  // 选择课程后自动带入教师/地点（仅当对应字段为空时，用户可改）
  const handleCourseChange = (courseId: string) => {
    const patch: Partial<ClassFormState> = { courseId }
    const c = courses.find((x) => x.id === courseId)
    if (c) {
      if (!form.teacher.trim() && c.teacher) patch.teacher = c.teacher
      if (!form.location.trim() && c.location) patch.location = c.location
    }
    update(patch)
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = '班级名称不能为空'
    if (form.defaultStartTime && !/^\d{2}:\d{2}$/.test(form.defaultStartTime)) {
      e.time = '默认开始时间需同时选择小时和分钟'
    }
    if (form.defaultEndTime && !/^\d{2}:\d{2}$/.test(form.defaultEndTime)) {
      e.time = '默认结束时间需同时选择小时和分钟'
    }
    const capNum = Number(form.capacity)
    if (!Number.isFinite(capNum) || capNum < 0) {
      e.capacity = '容量需为非负数'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (isEdit) {
        const result = await updateClass({
          id: form.id,
          name: form.name.trim(),
          courseId: form.courseId || undefined,
          teacher: form.teacher.trim(),
          location: form.location.trim(),
          defaultStartTime: form.defaultStartTime || undefined,
          defaultEndTime: form.defaultEndTime || undefined,
          capacity: Number(form.capacity || 0),
          status: form.status,
          remark: form.remark.trim(),
        })
        if (result.code === 0) {
          toast.success(result.message || '已保存')
          onSaved()
        } else if (result.data?.notFound) {
          showToast('error', '班级不存在或已被删除')
        } else {
          showToast('error', result.message || '保存失败')
        }
      } else {
        const result = await addClass({
          name: form.name.trim(),
          courseId: form.courseId || undefined,
          teacher: form.teacher.trim(),
          location: form.location.trim(),
          defaultStartTime: form.defaultStartTime || undefined,
          defaultEndTime: form.defaultEndTime || undefined,
          capacity: Number(form.capacity || 0),
          status: form.status,
          remark: form.remark.trim(),
        })
        if (result.code === 0) {
          toast.success(result.message || '已新增')
          onSaved()
        } else if (result.data?.exists) {
          setNameError('班级名称已存在')
        } else {
          showToast('error', result.message || '保存失败')
        }
      }
    } catch (e) {
      showToast('error', '保存失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? '编辑班级' : '新增班级'}
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
      <div className="space-y-4">
        {/* 班级名称 */}
        <Field label={'班级名称'} required error={nameError || errors.name}>
          <input
            type="text"
            className={inputClass}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={'如：三年级数学A班'}
            autoFocus
            maxLength={32}
          />
        </Field>

        {/* 关联课程 */}
        <Field label={'关联课程'} hint="选课程后可自动带入教师/地点，可修改">
          <select
            className={inputClass}
            value={form.courseId}
            onChange={(e) => handleCourseChange(e.target.value)}
          >
            <option value="">{'+ 不关联课程'}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        {/* 教师 */}
        <Field label={'教师'}>
          <input
            type="text"
            className={inputClass}
            value={form.teacher}
            onChange={(e) => update({ teacher: e.target.value })}
            placeholder={'如：张老师'}
          />
        </Field>

        {/* 地点 */}
        <Field label={'地点'}>
          <input
            type="text"
            className={inputClass}
            value={form.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder={'如：A教室201'}
          />
        </Field>

        {/* 默认时间：原生 type="time"，5 分钟刻度 */}
        <Field label={'默认时间'} error={errors.time} hint="分钟以 5 分钟为单位">
          <div className="flex items-center gap-2">
            <input
              type="time"
              step={300}
              value={form.defaultStartTime}
              onChange={(e) => update({ defaultStartTime: e.target.value })}
              className={cn(inputClass, 'bg-white w-32')}
            />
            <span className="text-slate-400 px-1">-</span>
            <input
              type="time"
              step={300}
              value={form.defaultEndTime}
              onChange={(e) => update({ defaultEndTime: e.target.value })}
              className={cn(inputClass, 'bg-white w-32')}
            />
          </div>
        </Field>

        {/* 容量 */}
        <Field label={'容量'} error={errors.capacity} hint="班级最大容纳人数">
          <input
            type="number"
            min={0}
            value={form.capacity}
            onChange={(e) => update({ capacity: e.target.value })}
            className={inputClass}
            placeholder={'如 20'}
          />
        </Field>

        {/* 状态 */}
        <Field label={'状态'}>
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => update({ status: e.target.value as ClassStatus })}
          >
            <option value="active">{'启用'}</option>
            <option value="inactive">{'停用'}</option>
          </select>
        </Field>

        {/* 备注 */}
        <Field label={'备注'}>
          <textarea
            className={cn(inputClass, 'min-h-[72px] resize-y')}
            value={form.remark}
            onChange={(e) => update({ remark: e.target.value })}
            rows={3}
            maxLength={200}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ===== 成员管理弹窗 =====
interface ClassMembersModalProps {
  cls: ClassInfo
  students: Student[]
  onClose: () => void
  onMembersChanged: () => void // 成员变更后刷新班级列表（memberCount）
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

function ClassMembersModal({ cls, students, onClose, onMembersChanged, showToast }: ClassMembersModalProps) {
  const [members, setMembers] = useState<ClassMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // 加载成员名单
  const loadMembers = async () => {
    setLoading(true)
    try {
      const result = await getClassMembers(cls.id)
      if (result.code === 0) {
        setMembers(result.data?.members || [])
      } else {
        showToast('error', result.message || '加载成员名单失败')
      }
    } catch (e) {
      showToast('error', '加载成员名单失败：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

  // 可添加学员：排除已是成员，支持按姓名/年级/手机号搜索
  const available = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    return students
      .filter((s) => !memberIds.has(s.id))
      .filter((s) => {
        if (!q) return true
        return (
          (s.name || '').toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q) ||
          (s.grade || '').toLowerCase().includes(q)
        )
      })
  }, [students, memberIds, addSearch])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdd = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBusy(true)
    try {
      const result = await addClassMembers(cls.id, ids)
      if (result.code === 0) {
        toast.success(`已添加 ${result.data?.added ?? ids.length} 名成员`)
        setSelected(new Set())
        setShowAdd(false)
        setAddSearch('')
        await loadMembers()
        onMembersChanged()
      } else {
        showToast('error', result.message || '添加成员失败')
      }
    } catch (e) {
      showToast('error', '添加成员失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (member: ClassMember) => {
    setBusy(true)
    try {
      const result = await removeClassMembers(cls.id, [member.id])
      if (result.code === 0) {
        toast.success('已移除')
        await loadMembers()
        onMembersChanged()
      } else {
        showToast('error', result.message || '移除成员失败')
      }
    } catch (e) {
      showToast('error', '移除成员失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`成员管理 · ${cls.name}`}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onClose}
          confirmText={'完成'}
        />
      }
    >
      <div className="space-y-4">
        {/* 成员名单 */}
        {loading ? (
          <div className="text-center text-sm text-slate-400 py-8">{'加载中…'}</div>
        ) : members.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">{'暂无成员，点击下方"添加成员"'}</div>
        ) : (
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">{'姓名'}</th>
                  <th className="text-left py-2 px-3 font-medium">{'年级'}</th>
                  <th className="text-left py-2 px-3 font-medium">{'手机'}</th>
                  <th className="text-left py-2 px-3 font-medium">{'加入时间'}</th>
                  <th className="text-right py-2 px-3 font-medium">{'操作'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-medium text-slate-700">{m.name}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {m.grade || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {m.phone || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-500 text-xs">
                      {m.joinedAt ? m.joinedAt.slice(0, 10) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => handleRemove(m)}
                        disabled={busy}
                        className="text-rose-500 hover:text-rose-600 text-xs font-medium disabled:opacity-50"
                      >
                        {'移除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 添加成员区 */}
        <div className="border-t border-slate-100 pt-4">
          {!showAdd ? (
            <Button variant="outline" onClick={() => setShowAdd(true)} disabled={busy}>
              + {'添加成员'}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder={'搜索姓名 / 年级 / 手机号'}
                  className={cn(inputClass, 'max-w-xs')}
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  可选 {available.length} 人
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-md">
                {available.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 py-6">{'无可添加的学员'}</div>
                ) : (
                  available.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
                      />
                      <span className="text-sm text-slate-700 font-medium">{s.name}</span>
                      {s.grade && <span className="text-xs text-slate-400">{s.grade}</span>}
                      {s.phone && <span className="text-xs text-slate-400">{s.phone}</span>}
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={handleAdd} loading={busy} disabled={selected.size === 0}>
                  {`添加选中（${selected.size}）`}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowAdd(false); setSelected(new Set()); setAddSearch('') }}
                  disabled={busy}
                >
                  {'取消'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
