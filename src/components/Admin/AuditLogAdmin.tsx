// 审计日志查看页（仅超管使用）—— 按模块/动作/操作者/日期筛选，服务端分页，行内展开查看 before/after
// 顶部「归档」标签页可查看/下载/删除按月归档的历史审计日志
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuditLog, AuditArchiveInfo } from '@/types'
import { listAuditLogs, listAuditArchives, readAuditArchive, deleteAuditArchive } from '@/api/admin'
import { fmtDateTimeFull } from '@/utils/tz'
import {
  Button,
  EmptyState,
  LoadingBlock,
  Pagination,
  SubPageHeader,
  confirmDialog,
  inputClass,
  toast,
} from '@/components/ui'

interface AuditLogAdminProps {
  onBack: () => void
}

const PAGE_SIZE = 20

// 模块选项（值与后端一致）
const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: 'students', label: '学员' },
  { value: 'courses', label: '课程' },
  { value: 'enrollments', label: '报名' },
  { value: 'transfers', label: '退课' },
  { value: 'accounts', label: '账户' },
  { value: 'schedules', label: '排课' },
  { value: 'attendance', label: '点名' },
  { value: 'announcement', label: '公告' },
  { value: 'admins', label: '管理员' },
  { value: 'auth', label: '登录' },
  { value: 'reports', label: '报表' },
]

// 动作选项（值与后端一致）
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'create', label: '新增' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'login', label: '登录' },
  { value: 'bootstrap', label: '初始化' },
]

interface LogFilters {
  module: string
  action: string
  actorId: string
  startDate: string
  endDate: string
}

const EMPTY_FILTERS: LogFilters = {
  module: '',
  action: '',
  actorId: '',
  startDate: '',
  endDate: '',
}

function moduleLabel(v: string): string {
  return MODULE_OPTIONS.find((o) => o.value === v)?.label || v
}

function actionLabel(v: string): string {
  return ACTION_OPTIONS.find((o) => o.value === v)?.label || v
}

// 动作徽章配色
function actionBadgeClass(action: string): string {
  switch (action) {
    case 'create':
      return 'bg-green-50 text-green-700'
    case 'update':
      return 'bg-blue-50 text-blue-700'
    case 'delete':
      return 'bg-rose-50 text-rose-700'
    case 'login':
      return 'bg-slate-100 text-slate-600'
    case 'bootstrap':
      return 'bg-brand-50 text-brand-700'
    default:
      return 'bg-slate-100 text-slate-500'
  }
}

// 操作者角色徽章配色
function actorRoleBadgeClass(role: string): string {
  switch (role) {
    case 'superadmin':
      return 'bg-brand-50 text-brand-700'
    case 'admin':
      return 'bg-blue-50 text-blue-700'
    case 'teacher':
      return 'bg-slate-100 text-slate-600'
    default:
      return 'bg-slate-100 text-slate-500'
  }
}

function actorRoleLabel(role: string): string {
  switch (role) {
    case 'superadmin':
      return '超管'
    case 'admin':
      return '管理员'
    case 'teacher':
      return '教师'
    default:
      return role
  }
}

// 审计时间按浏览器本地时区显示（后端存储 UTC）
function fmtDate(s?: string): string {
  return fmtDateTimeFull(s)
}

// 安全地格式化任意值为 JSON 字符串
function formatJson(v: unknown): string {
  if (v === undefined || v === null) return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

// 各模块字段中文标签（与后端 _lib/audit.js 的 FIELD_LABELS 保持一致）
const FIELD_LABELS: Record<string, Record<string, string>> = {
  students: {
    name: '姓名', grade: '年级', phone: '手机号', parentName: '家长姓名',
    gender: '性别', birthday: '生日', status: '状态', tags: '标签',
    remark: '备注', source: '来源', balance: '账户余额',
  },
  courses: {
    name: '课程名', color: '颜色', billingType: '计费方式',
    term: '学期', status: '状态', category: '分类', grade: '年级', description: '描述',
  },
  enrollments: {
    status: '状态', purchasedHours: '购买课时', giftHours: '赠课课时',
    unitPrice: '单价', totalAmount: '总金额', paidAmount: '已付金额',
    discountAmount: '优惠金额',
    paymentMethod: '支付方式', paymentStatus: '支付状态', contractNo: '合同号',
    expiredAt: '有效期', note: '备注',
  },
  schedules: {
    studentName: '学员', courseName: '课程', teacher: '教师', location: '地点',
    date: '日期', startTime: '开始时间', endTime: '结束时间', note: '备注',
    status: '状态', room: '教室', makeupFor: '补课标记', color: '颜色',
  },
  grades: {
    name: '年级名', sortOrder: '排序', status: '状态', description: '描述',
  },
  transfers: {
    studentId: '学员', fromEnrollmentId: '源报名',
    refundAmount: '退课金额', giftMode: '赠课处理', note: '备注', reason: '原因',
  },
  accounts: {
    type: '流水类型', amount: '金额', balanceAfter: '变动后余额',
    note: '备注', refType: '关联类型', refId: '关联ID',
  },
}

// 枚举值的中文展示
const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: { active: '进行中', inactive: '停用', settled: '已结转', finished: '已完结', expired: '已过期', scheduled: '已排课' },
  billingType: { per_lesson: '按课时', per_term: '按学期', per_month: '按月' },
  gender: { male: '男', female: '女' },
  giftMode: { discard: '赠课作废', refund: '赠课折算' },
  type: { refund: '退课转入', enroll_deduct: '报名抵扣' },
}

function valueLabel(field: string, val: unknown): string {
  if (val === '' || val === null || val === undefined) return '空'
  const map = VALUE_LABELS[field]
  if (map && typeof val === 'string' && map[val] !== undefined) return map[val]
  return String(val)
}

// before/after 可能是对象、JSON 字符串或空；统一解析为对象
function parseRecord(v: unknown): Record<string, unknown> | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return typeof parsed === 'object' && parsed !== null ? parsed : null
    } catch {
      return null
    }
  }
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

// 跳过的内部字段（不展示在 diff 中）
const SKIP_FIELDS = new Set(['id', 'createdAt', 'created_at', 'updatedAt', 'updated_at', 'password', 'passwordHash'])

// 数字归一比较：避免 0 与 '0' 误判为不同
function normalizeVal(v: unknown): unknown {
  if (typeof v === 'number') return v
  if (v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v)) && String(v).trim() !== '') {
    return Number(v)
  }
  return v
}

interface FieldDiff {
  field: string
  label: string
  from: unknown
  to: unknown
  changed: boolean // update 时表示是否变化；create/delete 时恒为 true
}

// 计算 before/after 的字段级差异
function computeDiffs(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  moduleKey: string,
): FieldDiff[] {
  const labels = FIELD_LABELS[moduleKey] || {}
  const fields = new Set<string>([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ])
  const diffs: FieldDiff[] = []
  for (const f of fields) {
    if (SKIP_FIELDS.has(f)) continue
    const b = before ? before[f] : undefined
    const a = after ? after[f] : undefined
    const bn = normalizeVal(b)
    const an = normalizeVal(a)
    const changed = bn !== an
    diffs.push({ field: f, label: labels[f] || f, from: b, to: a, changed })
  }
  return diffs
}

// 变更详情组件：根据 action 类型展示字段级 diff
function ChangeDetail({ log }: { log: AuditLog }) {
  const before = parseRecord(log.before)
  const after = parseRecord(log.after)
  const action = log.action
  const moduleKey = log.module

  // create：展示 after 的全部字段
  // delete：展示 before 的全部字段
  // update：仅展示发生变化的字段（旧值 → 新值）
  let diffs: FieldDiff[]
  if (action === 'create') {
    diffs = computeDiffs(null, after, moduleKey)
  } else if (action === 'delete') {
    diffs = computeDiffs(before, null, moduleKey)
  } else {
    // update / promote / 其他
    diffs = computeDiffs(before, after, moduleKey).filter((d) => d.changed)
  }

  if (diffs.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic">
        {before || after ? '无可展示的字段差异' : '无变更前/后数据'}
      </div>
    )
  }

  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-500">
            <th className="text-left py-1.5 px-2 font-medium w-28">字段</th>
            {action === 'update' ? (
              <>
                <th className="text-left py-1.5 px-2 font-medium">变更前</th>
                <th className="text-left py-1.5 px-2 font-medium">变更后</th>
              </>
            ) : (
              <th className="text-left py-1.5 px-2 font-medium">值</th>
            )}
          </tr>
        </thead>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.field} className="border-t border-slate-100">
              <td className="py-1.5 px-2 text-slate-500 align-top">{d.label}</td>
              {action === 'update' ? (
                <>
                  <td className="py-1.5 px-2 text-slate-500 align-top">
                    <span className="line-through decoration-slate-300">
                      {valueLabel(d.field, d.from)}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-slate-800 font-medium align-top">
                    {valueLabel(d.field, d.to)}
                  </td>
                </>
              ) : (
                <td className="py-1.5 px-2 text-slate-800 align-top">
                  {valueLabel(d.field, d.to)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AuditLogAdmin({ onBack }: AuditLogAdminProps) {
  // 顶部标签页：审计日志 / 归档
  const [tab, setTab] = useState<'logs' | 'archives'>('logs')
  // 草稿筛选（绑定输入控件）
  const [form, setForm] = useState<LogFilters>(EMPTY_FILTERS)
  // 已应用筛选（实际用于请求）
  const [applied, setApplied] = useState<LogFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 应用筛选/翻页变化时重新加载
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await listAuditLogs({
          module: applied.module || undefined,
          action: applied.action || undefined,
          actorId: applied.actorId.trim() || undefined,
          startDate: applied.startDate || undefined,
          endDate: applied.endDate || undefined,
          page,
          pageSize: PAGE_SIZE,
        })
        if (cancelled) return
        if (result.code === 0) {
          setLogs(result.data.logs)
          setTotal(result.data.total)
        } else {
          toast.error(result.message)
          setLogs([])
          setTotal(0)
        }
      } catch (e) {
        if (!cancelled) {
          toast.error((e as Error).message)
          setLogs([])
          setTotal(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [applied, page])

  // 模块/动作/日期变化：立即应用并回到第 1 页
  const applyField = (field: 'module' | 'action' | 'startDate' | 'endDate', value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    setApplied((f) => ({ ...f, [field]: value }))
    setPage(1)
  }

  // 操作者 ID 为文本输入，仅在点击「查询」时应用（避免逐字请求）
  const onActorIdChange = (value: string) => {
    setForm((f) => ({ ...f, actorId: value }))
  }

  const onQuery = () => {
    setApplied(form)
    setPage(1)
  }

  const onReset = () => {
    setForm(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={'审计日志'} onBack={onBack} />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* 标签切换：审计日志 / 归档 */}
        <div className="flex gap-1 border-b border-slate-200">
          <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
            {'审计日志'}
          </TabButton>
          <TabButton active={tab === 'archives'} onClick={() => setTab('archives')}>
            {'归档'}
          </TabButton>
        </div>

        {tab === 'logs' && (
        <>
        {/* 筛选条 */}
        <section className="card p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{'模块'}</label>
              <select
                className={inputClass}
                value={form.module}
                onChange={(e) => applyField('module', e.target.value)}
              >
                <option value="">{'全部'}</option>
                {MODULE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{'动作'}</label>
              <select
                className={inputClass}
                value={form.action}
                onChange={(e) => applyField('action', e.target.value)}
              >
                <option value="">{'全部'}</option>
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{'操作者'} ID</label>
              <input
                className={inputClass}
                value={form.actorId}
                onChange={(e) => onActorIdChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onQuery()
                }}
                placeholder="可选"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{'开始日期'}</label>
              <input
                type="date"
                className={inputClass}
                value={form.startDate}
                onChange={(e) => applyField('startDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">结束日期</label>
              <input
                type="date"
                className={inputClass}
                value={form.endDate}
                onChange={(e) => applyField('endDate', e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={onReset}>
              {'重置'}
            </Button>
            <Button variant="primary" onClick={onQuery}>
              {'查询'}
            </Button>
          </div>
        </section>

        {/* 列表 */}
        {loading ? (
          <LoadingBlock />
        ) : logs.length === 0 ? (
          <EmptyState title={'暂无审计日志'} description="筛选条件下没有记录" />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'时间'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'操作者'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'模块'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'动作'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'目标'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'摘要'}</th>
                    <th className="text-left py-2 px-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const expanded = expandedId === log.id
                    return (
                      <LogRow
                        key={log.id}
                        log={log}
                        expanded={expanded}
                        onToggle={() => setExpandedId(expanded ? null : log.id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>
        )}
        </>
        )}

        {tab === 'archives' && <ArchivePanel />}
      </main>
    </div>
  )
}

// 单行日志 + 展开详情（字段级 diff）
function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLog
  expanded: boolean
  onToggle: () => void
}) {
  const [showRaw, setShowRaw] = useState(false)
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
      >
        <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <svg
              className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {fmtDate(log.createdAt)}
          </span>
        </td>
        <td className="py-2.5 px-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-slate-700 font-medium">{log.actorName}</span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${actorRoleBadgeClass(
                String(log.actorRole),
              )}`}
            >
              {actorRoleLabel(String(log.actorRole))}
            </span>
          </span>
        </td>
        <td className="py-2.5 px-2 text-slate-600">{moduleLabel(log.module)}</td>
        <td className="py-2.5 px-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionBadgeClass(
              log.action,
            )}`}
          >
            {actionLabel(log.action)}
          </span>
        </td>
        <td className="py-2.5 px-2 text-slate-600">
          {log.targetName ? (
            <span>
              {log.targetType && (
                <span className="text-slate-400 text-xs mr-1">{log.targetType}</span>
              )}
              {log.targetName}
            </span>
          ) : log.targetId ? (
            <span className="font-mono text-xs text-slate-500">{log.targetId}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-slate-600 max-w-xs truncate" title={log.summary || ''}>
          {log.summary || <span className="text-slate-300">—</span>}
        </td>
        <td className="py-2.5 px-2 text-slate-500 font-mono text-xs whitespace-nowrap">
          {log.ip || <span className="text-slate-300">—</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-slate-500">
                {log.action === 'create' ? '创建内容' : log.action === 'delete' ? '删除内容' : '字段变更明细'}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRaw((v) => !v)
                }}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                {showRaw ? '查看明细' : '查看原始 JSON'}
              </button>
            </div>
            {showRaw ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">{'变更前'} (before)</div>
                  <pre className="text-xs bg-white border border-slate-200 rounded p-2 overflow-x-auto max-h-64 font-mono">
                    {formatJson(log.before)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">{'变更后'} (after)</div>
                  <pre className="text-xs bg-white border border-slate-200 rounded p-2 overflow-x-auto max-h-64 font-mono">
                    {formatJson(log.after)}
                  </pre>
                </div>
              </div>
            ) : (
              <ChangeDetail log={log} />
            )}
            {log.userAgent && (
              <div className="text-xs text-slate-400 mt-2 break-all">UA: {log.userAgent}</div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// 标签按钮
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

// 文件大小可读化
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// 归档列表 + 展开查看当月日志
function ArchivePanel() {
  const [archives, setArchives] = useState<AuditArchiveInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<AuditLog[]>([])
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  async function loadArchives() {
    setLoading(true)
    try {
      const result = await listAuditArchives()
      if (result.code === 0) {
        setArchives(result.data.archives)
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadArchives()
  }, [])

  async function toggleView(month: string) {
    if (expandedMonth === month) {
      setExpandedMonth(null)
      setExpandedLogs([])
      setExpandedRowId(null)
      return
    }
    setExpandedMonth(month)
    setExpandedLogs([])
    setExpandedRowId(null)
    setLoadingMonth(true)
    try {
      const result = await readAuditArchive(month)
      if (result.code === 0) {
        setExpandedLogs(result.data.logs)
      } else {
        toast.error(result.message)
        setExpandedMonth(null)
      }
    } catch (e) {
      toast.error((e as Error).message)
      setExpandedMonth(null)
    } finally {
      setLoadingMonth(false)
    }
  }

  async function onDownload(month: string) {
    try {
      const result = await readAuditArchive(month)
      if (result.code !== 0) {
        toast.error(result.message)
        return
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-${month}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function onDelete(month: string) {
    const ok = await confirmDialog({
      title: '删除归档？',
      message: `将永久删除 ${month} 的审计日志归档文件，此操作不可恢复。`,
      danger: true,
    })
    if (!ok) return
    try {
      const result = await deleteAuditArchive(month)
      if (result.code === 0) {
        toast.success('已删除')
        if (expandedMonth === month) {
          setExpandedMonth(null)
          setExpandedLogs([])
        }
        loadArchives()
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) return <LoadingBlock />
  if (archives.length === 0) {
    return (
      <EmptyState
        title={'暂无归档'}
        description="月末将自动归档上月审计日志，也可在需要时手动归档"
      />
    )
  }

  return (
    <section className="card p-5 space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-xs">
              <th className="text-left py-2 px-2 font-medium">{'月份'}</th>
              <th className="text-left py-2 px-2 font-medium">{'记录数'}</th>
              <th className="text-left py-2 px-2 font-medium">{'文件大小'}</th>
              <th className="text-left py-2 px-2 font-medium">{'归档时间'}</th>
              <th className="text-left py-2 px-2 font-medium">{'操作'}</th>
            </tr>
          </thead>
          <tbody>
            {archives.map((a) => {
              const expanded = expandedMonth === a.month
              return (
                <tr
                  key={a.month}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-2.5 px-2 font-mono text-slate-700">{a.month}</td>
                  <td className="py-2.5 px-2 text-slate-600">{a.count}</td>
                  <td className="py-2.5 px-2 text-slate-600">{formatSize(a.size)}</td>
                  <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                    {fmtDate(a.createdAt)}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleView(a.month)}
                        className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                      >
                        {expanded ? '收起' : '查看'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownload(a.month)}
                        className="text-slate-500 hover:text-slate-700 text-xs"
                      >
                        {'下载'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(a.month)}
                        className="text-rose-500 hover:text-rose-700 text-xs"
                      >
                        {'删除'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 展开当月归档日志列表（复用 LogRow） */}
      {expandedMonth && (
        <div className="border-t border-slate-200 pt-4">
          <div className="text-xs font-medium text-slate-500 mb-2">
            {expandedMonth} 归档日志
            {loadingMonth ? '（加载中…）' : `（共 ${expandedLogs.length} 条）`}
          </div>
          {loadingMonth ? (
            <LoadingBlock />
          ) : expandedLogs.length === 0 ? (
            <EmptyState title={'无记录'} description="该月份归档为空" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'时间'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'操作者'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'模块'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'动作'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'目标'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'摘要'}</th>
                    <th className="text-left py-2 px-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {expandedLogs.map((log) => {
                    const expanded = expandedRowId === log.id
                    return (
                      <LogRow
                        key={log.id}
                        log={log}
                        expanded={expanded}
                        onToggle={() => setExpandedRowId(expanded ? null : log.id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
