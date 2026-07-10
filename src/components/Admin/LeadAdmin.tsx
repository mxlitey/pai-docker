// CRM 线索管理页 —— 阶段筛选 / 增删改 / 跟进记录 / 转化学员标记
import { useEffect, useState } from 'react'
import type { Lead, LeadStage, LeadFollowup } from '@/types'
import { fmtDateTime } from '@/utils/tz'
import {
  getLeads,
  addLead,
  updateLead,
  deleteLead,
  getFollowups,
  addFollowup,
} from '@/api/admin'
import {
  Button,
  EmptyState,
  Field,
  LoadingBlock,
  Modal,
  ModalFooter,
  SubPageHeader,
  inputClass,
  toast,
  confirmDialog,
} from '@/components/ui'

interface LeadAdminProps {
  onBack: () => void
}

// 阶段 → 中文标签
const STAGE_LABEL_KEY: Record<LeadStage, string> = {
  new: '新建',
  contacted: '已联系',
  trial: '试听',
  intentioned: '有意向',
  signed: '已签约',
  lost: '已流失',
}

// 阶段 → 彩色徽章 class（new=蓝, contacted=青, trial=橙, intentioned=紫, signed=绿, lost=灰）
const STAGE_BADGE: Record<LeadStage, string> = {
  new: 'bg-blue-50 text-blue-700',
  contacted: 'bg-cyan-50 text-cyan-700',
  trial: 'bg-orange-50 text-orange-700',
  intentioned: 'bg-purple-50 text-purple-700',
  signed: 'bg-green-50 text-green-700',
  lost: 'bg-slate-100 text-slate-500',
}

const STAGE_OPTIONS: LeadStage[] = ['new', 'contacted', 'trial', 'intentioned', 'signed', 'lost']

export function LeadAdmin({ onBack }: LeadAdminProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState<'' | LeadStage>('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [followupLead, setFollowupLead] = useState<Lead | null>(null)
  const [busy, setBusy] = useState(false)

  async function load(stage: '' | LeadStage) {
    setLoading(true)
    try {
      const list = await getLeads(stage ? { stage } : undefined)
      setLeads(list)
    } catch (e) {
      toast.error((e as Error).message || '加载线索失败')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(stageFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter])

  // 新增线索
  async function handleAdd(form: LeadFormState) {
    setBusy(true)
    try {
      const result = await addLead({
        name: form.name.trim(),
        phone: form.phone.trim(),
        grade: form.grade.trim(),
        source: form.source.trim(),
        stage: form.stage,
        intention: form.intention.trim(),
        assignedTo: form.assignedTo.trim(),
        remark: form.remark.trim(),
      })
      if (result.code !== 0) {
        throw new Error(result.message || '新增失败')
      }
      toast.success('线索已新增')
      setAdding(false)
      await load(stageFilter)
    } catch (e) {
      toast.error((e as Error).message || '新增失败')
    } finally {
      setBusy(false)
    }
  }

  // 编辑线索
  async function handleUpdate(lead: Lead, form: LeadFormState) {
    setBusy(true)
    try {
      const result = await updateLead(lead.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        grade: form.grade.trim(),
        source: form.source.trim(),
        stage: form.stage,
        intention: form.intention.trim(),
        assignedTo: form.assignedTo.trim(),
        remark: form.remark.trim(),
      })
      if (result.code !== 0) {
        throw new Error(result.message || '更新失败')
      }
      toast.success('线索已更新')
      setEditing(null)
      await load(stageFilter)
    } catch (e) {
      toast.error((e as Error).message || '更新失败')
    } finally {
      setBusy(false)
    }
  }

  // 删除线索
  async function handleDelete(lead: Lead) {
    const ok = await confirmDialog({
      title: '删除线索',
      message: `确认删除线索「${lead.name}」？关联的跟进记录也会一并删除。`,
      danger: true,
      confirmText: '确认',
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await deleteLead(lead.id)
      if (result.code !== 0) {
        throw new Error(result.message || '删除失败')
      }
      toast.success('线索已删除')
      await load(stageFilter)
    } catch (e) {
      toast.error((e as Error).message || '删除失败')
    } finally {
      setBusy(false)
    }
  }

  // 转化为学员：仅标记 converted + 阶段置为 signed（实际建档请去学员管理页）
  async function handleConvert(lead: Lead) {
    const ok = await confirmDialog({
      title: '转化为学员？',
      message: `将线索「${lead.name}」标记为已转化，阶段置为「已签约」。实际学员建档请前往学员管理页完成。`,
      confirmText: '标记转化',
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await updateLead(lead.id, { converted: true, stage: 'signed' })
      if (result.code !== 0) {
        throw new Error(result.message || '转化失败')
      }
      toast.success('已标记转化为学员，请前往学员管理页完成建档')
      await load(stageFilter)
    } catch (e) {
      toast.error((e as Error).message || '转化失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={'线索管理'} onBack={onBack} count={leads.length}>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={busy || loading}>
          {`+ 新增线索`}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 阶段筛选 */}
        <section className="card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 w-40">
              <span className="text-xs text-slate-500">阶段筛选</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as '' | LeadStage)}
                className={inputClass}
              >
                <option value="">全部阶段</option>
                {STAGE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL_KEY[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* 列表 */}
        {loading ? (
          <LoadingBlock />
        ) : leads.length === 0 ? (
          <EmptyState
            title="暂无线索"
            description="点击下方按钮录入第一条线索"
            action={
              <Button variant="primary" onClick={() => setAdding(true)} disabled={busy}>
                + 新增第一条线索
              </Button>
            }
          />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'姓名'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'电话'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'年级'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'来源'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'阶段'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'意向'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'负责人'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'跟进'}</th>
                    <th className="text-right py-2 px-2 font-medium">{'操作'}</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2 font-medium text-slate-700 whitespace-nowrap">
                        {l.name}
                        {l.converted && (
                          <span className="ml-1.5 text-xs text-green-600" title="已标记转化">
                            ✓
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {l.phone || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {l.grade || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {l.source || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STAGE_BADGE[l.stage] || STAGE_BADGE.new}`}
                        >
                          {STAGE_LABEL_KEY[l.stage] || l.stage}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {l.intention || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {l.assignedTo || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <button
                          onClick={() => setFollowupLead(l)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium disabled:opacity-50"
                        >
                          {'跟进'}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(l)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          {'编辑'}
                        </button>
                        <button
                          onClick={() => handleConvert(l)}
                          disabled={busy || l.converted}
                          className="text-purple-600 hover:text-purple-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          {l.converted ? '已转化' : '转化为学员'}
                        </button>
                        <button
                          onClick={() => handleDelete(l)}
                          disabled={busy}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          {'删除'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* 新增线索 */}
      {adding && (
        <LeadEditModal
          onClose={() => setAdding(false)}
          onSubmit={handleAdd}
          saving={busy}
        />
      )}

      {/* 编辑线索 */}
      {editing && (
        <LeadEditModal
          lead={editing}
          onClose={() => setEditing(null)}
          onSubmit={(form) => handleUpdate(editing, form)}
          saving={busy}
        />
      )}

      {/* 跟进 Modal */}
      {followupLead && (
        <FollowupModal
          lead={followupLead}
          onClose={() => setFollowupLead(null)}
          onChanged={() => load(stageFilter)}
        />
      )}
    </div>
  )
}

// ===== 表单状态 =====
interface LeadFormState {
  name: string
  phone: string
  grade: string
  source: string
  stage: LeadStage
  intention: string
  assignedTo: string
  remark: string
}

function emptyForm(): LeadFormState {
  return {
    name: '',
    phone: '',
    grade: '',
    source: '',
    stage: 'new',
    intention: '',
    assignedTo: '',
    remark: '',
  }
}

function leadToForm(l: Lead): LeadFormState {
  return {
    name: l.name || '',
    phone: l.phone || '',
    grade: l.grade || '',
    source: l.source || '',
    stage: l.stage || 'new',
    intention: l.intention || '',
    assignedTo: l.assignedTo || '',
    remark: l.remark || '',
  }
}

// ===== 新增/编辑线索弹窗 =====
interface LeadEditModalProps {
  lead?: Lead
  onClose: () => void
  onSubmit: (form: LeadFormState) => void | Promise<void>
  saving: boolean
}

function LeadEditModal({ lead, onClose, onSubmit, saving }: LeadEditModalProps) {
  const isEdit = !!lead
  const [form, setForm] = useState<LeadFormState>(lead ? leadToForm(lead) : emptyForm())
  const [nameError, setNameError] = useState('')

  const update = (patch: Partial<LeadFormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    if ('name' in patch) setNameError('')
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      setNameError('线索姓名不能为空')
      return
    }
    onSubmit(form)
  }

  return (
    <Modal
      title={isEdit ? '编辑线索' : '新增线索'}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          loading={saving}
          confirmText={isEdit ? '保存' : '新增'}
          confirmDisabled={saving}
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
            placeholder="如：张伟"
            autoFocus
          />
        </Field>

        <Field label={'电话'}>
          <input
            type="text"
            className={inputClass}
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="如：13800000000"
          />
        </Field>

        <Field label={'年级'} hint="如：高三">
          <input
            type="text"
            className={inputClass}
            value={form.grade}
            onChange={(e) => update({ grade: e.target.value })}
            placeholder="如：高三"
          />
        </Field>

        <Field label={'来源'} hint="如：转介绍 / 地推 / 线上">
          <input
            type="text"
            className={inputClass}
            value={form.source}
            onChange={(e) => update({ source: e.target.value })}
            placeholder="如：转介绍"
          />
        </Field>

        <Field label={'阶段'} required>
          <select
            className={inputClass}
            value={form.stage}
            onChange={(e) => update({ stage: e.target.value as LeadStage })}
          >
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL_KEY[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label={'意向'} hint="如：高 / 中 / 低">
          <input
            type="text"
            className={inputClass}
            value={form.intention}
            onChange={(e) => update({ intention: e.target.value })}
            placeholder="如：高"
          />
        </Field>

        <Field label={'负责人'}>
          <input
            type="text"
            className={inputClass}
            value={form.assignedTo}
            onChange={(e) => update({ assignedTo: e.target.value })}
            placeholder="如：王老师"
          />
        </Field>

        <Field label={'备注'} className="sm:col-span-2">
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={form.remark}
            onChange={(e) => update({ remark: e.target.value })}
            placeholder="选填"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ===== 跟进记录弹窗 =====
interface FollowupModalProps {
  lead: Lead
  onClose: () => void
  onChanged: () => void
}

function FollowupModal({ lead, onClose, onChanged }: FollowupModalProps) {
  const [list, setList] = useState<LeadFollowup[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [stage, setStage] = useState<'' | LeadStage>('')
  const [saving, setSaving] = useState(false)

  async function loadFollowups() {
    setLoading(true)
    try {
      const data = await getFollowups(lead.id)
      setList(data)
    } catch (e) {
      toast.error((e as Error).message || '加载跟进记录失败')
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFollowups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  async function handleSubmit() {
    if (!content.trim()) {
      toast.warning('请输入跟进内容')
      return
    }
    setSaving(true)
    try {
      const result = await addFollowup({
        leadId: lead.id,
        content: content.trim(),
        stage: stage || undefined,
      })
      if (result.code !== 0) {
        throw new Error(result.message || '保存失败')
      }
      toast.success('跟进已记录')
      setContent('')
      setStage('')
      await loadFollowups()
      onChanged()
    } catch (e) {
      toast.error((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`跟进记录 · ${lead.name}`}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSubmit}
          loading={saving}
          confirmText="提交跟进"
          confirmDisabled={saving || !content.trim()}
        />
      }
    >
      {/* 新增跟进输入区 */}
      <div className="space-y-3 mb-5">
        <Field label={'跟进内容'} required>
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="如：电话沟通，家长表示下周试听"
            autoFocus
          />
        </Field>
        <Field label={'阶段'} hint="选填，记录本次跟进后所处阶段">
          <select
            className={inputClass}
            value={stage}
            onChange={(e) => setStage(e.target.value as '' | LeadStage)}
          >
            <option value="">不更新阶段</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL_KEY[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* 历史跟进列表 */}
      <div>
        <div className="text-xs text-slate-500 mb-2">{'跟进记录'}</div>
        {loading ? (
          <div className="text-sm text-slate-400 py-6 text-center">{'加载中…'}</div>
        ) : list.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">暂无跟进记录</div>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {list.map((fu) => (
              <li
                key={fu.id}
                className="border border-slate-100 rounded-md px-3 py-2 bg-slate-50/50"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-400">
                    {fmtDateTime(fu.createdAt)}
                  </span>
                  {fu.stage && STAGE_OPTIONS.includes(fu.stage as LeadStage) && (
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${STAGE_BADGE[fu.stage as LeadStage]}`}
                    >
                      {STAGE_LABEL_KEY[fu.stage as LeadStage]}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                  {fu.content}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
