import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Course, Enrollment, EnrollmentStatus, Student } from '@/types'
import { cn } from '@/utils/cn'
import { getCourseDotClass } from '@/utils/courseColors'
import { todayLocal } from '@/utils/date'
import { fmtDateTime } from '@/utils/tz'
import {
  addEnrollment,
  deleteEnrollment,
  listEnrollments,
  updateEnrollment,
} from '@/api/admin'
import { SearchBar } from '@/components/SearchBar'
import {
  Button,
  confirmDialog,
  EmptyState,
  Field,
  inputClass,
  LoadingBlock,
  Modal,
  ModalFooter,
  Pagination,
  SubPageHeader,
} from '@/components/ui'

interface EnrollmentAdminProps {
  students: Student[]
  courses: Course[]
  busy: boolean // 父级全局忙碌状态，禁用按钮
  onBack: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  onAuthError: (e: Error) => void // 401 等错误处理
  onStudentsChanged: () => void // 报名抵扣余额后刷新学员列表（更新余额展示）
}

const PAGE_SIZE = 15

const STATUS_OPTIONS: { value: '' | EnrollmentStatus; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '进行中' },
  { value: 'settled', label: '已结转' },
  { value: 'finished', label: '已结课' },
]

// 金额格式化：整数显示 ¥200，非整数显示 ¥200.50
function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '¥0'
  return Number.isInteger(value) ? `¥${value}` : `¥${value.toFixed(2)}`
}

// 四舍五入到 2 位小数，避免浮点比较误差
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// 报名时间按浏览器本地时区显示（后端存储 UTC）
function formatDateTime(iso: string): string {
  return fmtDateTime(iso)
}

// 判断是否为 401 类鉴权错误（API 层 401 会抛出 message 含"未登录"的 Error）
function isAuthError(e: Error): boolean {
  const msg = e.message || ''
  return msg.includes('未登录') || msg.includes('登录已过期') || msg.includes('401')
}

// 当天日期字符串 yyyy-MM-dd（用于判定过期，基于浏览器本地时区）
function todayDateStr(): string {
  return todayLocal()
}

// 报名记录的有效展示状态：后端 expire 任务会把 status 置为 'expired'；
// 此外若 expiredAt 早于今天，前端也按已过期展示（即使 status 尚未被扫描更新）
function effectiveStatus(e: Enrollment): EnrollmentStatus | 'expired' {
  // 后端运行期可能写入 'expired'（类型枚举未包含，此处按字符串比较）
  if ((e.status as string) === 'expired') return 'expired'
  if (e.expiredAt && e.expiredAt < todayDateStr()) return 'expired'
  return e.status
}

// 状态 -> 中文标签（CSV 导出用）
function statusLabel(status: EnrollmentStatus | 'expired'): string {
  switch (status) {
    case 'active':
      return '进行中'
    case 'settled':
      return '已结转'
    case 'finished':
      return '已结课'
    case 'expired':
      return '已过期'
  }
}

// CSV 导出：报名列表（UTF-8 BOM）
function exportEnrollmentsCsv(
  enrollments: Enrollment[],
  studentMap: Map<string, Student>,
  courseMap: Map<string, Course>,
) {
  const headers = [
    '报名ID', '学员ID', '学员姓名', '课程ID', '课程名', '状态',
    '购课课时', '赠课课时', '剩余付费课时', '剩余赠课课时', '单价', '实付',
    '有效期', '报名时间',
  ]
  const rows = enrollments.map((e) => {
    const student = studentMap.get(e.studentId)
    const course = courseMap.get(e.courseId)
    return [
      e.id,
      e.studentId,
      student?.name || '',
      e.courseId,
      course?.name || '',
      statusLabel(effectiveStatus(e)),
      String(e.purchasedHours ?? 0),
      String(e.giftHours ?? 0),
      String(e.remainingPaidHours ?? 0),
      String(e.remainingGiftHours ?? 0),
      String(e.unitPrice ?? 0),
      String(e.paidAmount ?? 0),
      e.expiredAt || '',
      e.enrolledAt || '',
    ]
  })
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => {
      const v = String(c ?? '')
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    }).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `报名记录_${todayLocal()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function EnrollmentAdmin({
  students,
  courses,
  busy,
  onBack,
  showToast,
  onAuthError,
  onStudentsChanged,
}: EnrollmentAdminProps) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStudentId, setFilterStudentId] = useState('')
  const [filterStatus, setFilterStatus] = useState<'' | EnrollmentStatus>('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Enrollment | null>(null)
  // 本地操作忙碌（删除进行中），与父级 busy 共同禁用按钮
  const [localBusy, setLocalBusy] = useState(false)

  const actionDisabled = busy || localBusy

  // 学员/课程 id → 对象映射，用于列表展示名称
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])

  // 加载报名记录（按当前筛选条件）
  const loadEnrollments = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listEnrollments({
        studentId: filterStudentId || undefined,
        status: filterStatus || undefined,
      })
      if (result.code === 0) {
        setEnrollments(result.data.enrollments)
      } else {
        showToast('error', result.message || '加载报名记录失败')
        setEnrollments([])
      }
    } catch (e) {
      const err = e as Error
      if (isAuthError(err)) {
        onAuthError(err)
      } else {
        showToast('error', '加载报名记录失败：' + err.message)
      }
      setEnrollments([])
    } finally {
      setLoading(false)
    }
  }, [filterStudentId, filterStatus, showToast, onAuthError])

  // mount 及筛选变化时自动加载
  useEffect(() => {
    loadEnrollments()
  }, [loadEnrollments])

  // 筛选变化时回到第一页
  useEffect(() => {
    setPage(1)
  }, [filterStudentId, filterStatus])

  // 按报名时间升序排列（后端已升序返回，前端再保险排一次）
  const sorted = useMemo(() => {
    return [...enrollments].sort((a, b) =>
      (a.enrolledAt || '').localeCompare(b.enrolledAt || ''),
    )
  }, [enrollments])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }, [sorted, safePage])

  // 删除报名：二次确认
  const handleDelete = async (e: Enrollment) => {
    const studentName = studentMap.get(e.studentId)?.name || e.studentId
    const courseName = courseMap.get(e.courseId)?.name || e.courseId
    const ok = await confirmDialog({
      title: '删除报名记录',
      message: `确认删除「${studentName}」在「${courseName}」的报名记录？此操作不可恢复。`,
      danger: true,
      confirmText: '删除',
    })
    if (!ok) return
    setLocalBusy(true)
    try {
      const result = await deleteEnrollment(e.id)
      if (result.code === 0) {
        showToast('success', '报名已删除')
        await loadEnrollments()
      } else {
        showToast('error', result.message || '删除失败')
      }
    } catch (err) {
      const error = err as Error
      if (isAuthError(error)) {
        onAuthError(error)
      } else {
        showToast('error', '删除失败：' + error.message)
      }
    } finally {
      setLocalBusy(false)
    }
  }

  // 导出当前列表为 CSV（按报名时间升序，与列表一致）
  const handleExportCsv = () => {
    if (sorted.length === 0) return
    exportEnrollmentsCsv(sorted, studentMap, courseMap)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <SubPageHeader title={'报名管理'} onBack={onBack} count={sorted.length}>
        <Button variant="outline" onClick={handleExportCsv} disabled={sorted.length === 0}>
          {'导出 CSV'}
        </Button>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={actionDisabled}>
          + {'新增报名'}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* 筛选区 */}
        <section className="card p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">{'学员'}</label>
              <select
                value={filterStudentId}
                onChange={(e) => setFilterStudentId(e.target.value)}
                className={cn(inputClass, 'bg-white w-48')}
              >
                <option value="">全部学员</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.grade ? `（${s.grade}）` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">{'状态'}</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as '' | EnrollmentStatus)}
                className={cn(inputClass, 'bg-white w-32')}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 列表区 */}
        {loading ? (
          <LoadingBlock />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="暂无报名记录"
            description="可调整上方筛选条件，或新增一条报名记录"
            action={
              <Button variant="primary" onClick={() => setAdding(true)} disabled={actionDisabled}>
                + {'新增报名'}
              </Button>
            }
          />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'学员'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'课程'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'状态'}</th>
                    <th className="text-right py-2 px-2 font-medium">购课</th>
                    <th className="text-right py-2 px-2 font-medium">赠课</th>
                    <th className="text-left py-2 px-2 font-medium">剩余课时</th>
                    <th className="text-right py-2 px-2 font-medium">{'单价'}</th>
                    <th className="text-right py-2 px-2 font-medium">应付</th>
                    <th className="text-right py-2 px-2 font-medium">实付</th>
                    <th className="text-left py-2 px-2 font-medium">{'报名时间'}</th>
                    <th className="text-right py-2 px-2 font-medium">{'操作'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((e) => {
                    const student = studentMap.get(e.studentId)
                    const course = courseMap.get(e.courseId)
                    return (
                      <tr
                        key={e.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-2.5 px-2 font-medium text-slate-700 whitespace-nowrap">
                          {student ? (
                            student.name
                          ) : (
                            <span className="text-slate-300">{e.studentId}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-slate-700">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-block w-2.5 h-2.5 rounded-full flex-shrink-0',
                                getCourseDotClass(course?.color),
                              )}
                            />
                            {course ? (
                              course.name
                            ) : (
                              <span className="text-slate-300">{e.courseId}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <StatusBadge status={effectiveStatus(e)} />
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-700 whitespace-nowrap font-medium">
                          {e.purchasedHours}
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-600 whitespace-nowrap">
                          {e.giftHours > 0 ? (
                            e.giftHours
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">{renderRemaining(e)}</td>
                        <td className="py-2.5 px-2 text-right text-slate-600 whitespace-nowrap">
                          {formatMoney(e.unitPrice)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-600 whitespace-nowrap">
                          {formatMoney(e.totalAmount)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-600 whitespace-nowrap">
                          {formatMoney(e.paidAmount)}
                        </td>
                        <td className="py-2.5 px-2 text-slate-500 text-xs whitespace-nowrap">
                          {formatDateTime(e.enrolledAt)}
                        </td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditing(e)}
                            disabled={actionDisabled}
                            className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                          >
                            {'编辑'}
                          </button>
                          <button
                            onClick={() => handleDelete(e)}
                            disabled={actionDisabled}
                            className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                          >
                            {'删除'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>
        )}
      </main>

      {/* 新增弹窗 */}
      {adding && (
        <EnrollmentEditModal
          students={students}
          courses={courses}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            await loadEnrollments()
            onStudentsChanged()
          }}
          showToast={showToast}
          onAuthError={onAuthError}
        />
      )}

      {/* 编辑弹窗 */}
      {editing && (
        <EnrollmentEditModal
          students={students}
          courses={courses}
          enrollment={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await loadEnrollments()
            onStudentsChanged()
          }}
          showToast={showToast}
          onAuthError={onAuthError}
        />
      )}
    </div>
  )
}

// 状态标签
function StatusBadge({ status }: { status: EnrollmentStatus | 'expired' }) {
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-rose-50 text-rose-700 border border-rose-200">
        已过期
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200">
        进行中
      </span>
    )
  }
  if (status === 'settled') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
        已结转
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
      已结课
    </span>
  )
}

// 剩余课时展示：剩余 X（付费 a + 赠课 b），为 0 时 rose 高亮并标注"已用完"
function renderRemaining(e: Enrollment) {
  const rem = e.remainingPaidHours + e.remainingGiftHours
  const usedUp = rem <= 0
  return (
    <div className="whitespace-nowrap">
      <span className={usedUp ? 'text-rose-600 font-medium' : 'text-slate-700 font-medium'}>
        剩余 {rem}
      </span>
      <span className="text-slate-400 text-xs">
        （付费 {e.remainingPaidHours} + 赠课 {e.remainingGiftHours}）
      </span>
      {usedUp && <span className="ml-1 text-xs text-rose-500">已用完</span>}
    </div>
  )
}

// ===== 新增/编辑报名弹窗（共用） =====
interface EnrollmentEditModalProps {
  students: Student[]
  courses: Course[]
  enrollment?: Enrollment // 有值 = 编辑模式；无值 = 新增模式
  onClose: () => void
  onSaved: () => Promise<void> // 成功后刷新列表（await 完成后再关闭弹窗）
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  onAuthError: (e: Error) => void
}

interface EnrollmentForm {
  studentId: string
  courseId: string
  purchasedHours: string
  giftHours: string
  unitPrice: string
  paidAmount: string
  status: EnrollmentStatus
  // 有效期 yyyy-MM-dd；空串表示无有效期（永不过期）
  expiredAt: string
  note: string
  // 新增模式：是否使用账户余额抵扣实付金额
  useBalance: boolean
}

function EnrollmentEditModal({
  students,
  courses,
  enrollment,
  onClose,
  onSaved,
  showToast,
  onAuthError,
}: EnrollmentEditModalProps) {
  const isEdit = !!enrollment
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])

  const [form, setForm] = useState<EnrollmentForm>(() => {
    if (enrollment) {
      return {
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        purchasedHours: String(enrollment.purchasedHours ?? 0),
        giftHours: String(enrollment.giftHours ?? 0),
        unitPrice: String(enrollment.unitPrice ?? 0),
        paidAmount: String(enrollment.paidAmount ?? 0),
        status: enrollment.status,
        expiredAt: enrollment.expiredAt ? enrollment.expiredAt.slice(0, 10) : '',
        note: enrollment.note || '',
        useBalance: false,
      }
    }
    return {
      studentId: '',
      courseId: '',
      purchasedHours: '',
      giftHours: '0',
      unitPrice: '',
      paidAmount: '',
      status: 'active',
      expiredAt: '',
      note: '',
      useBalance: false,
    }
  })
  // 新增模式下通过 SearchBar 搜索选中的学员对象（用于按年级过滤可选课程）
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(
    enrollment ? studentMap.get(enrollment.studentId) || null : null,
  )
  // 实付金额是否被用户手动改过：
  // 新增模式默认未触碰 → 随购课/单价实时同步默认值（=购课×单价）；
  // 编辑模式默认已触碰 → 保留已存储的实付金额，不自动覆盖
  const [paidTouched, setPaidTouched] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 按所选学员的年级过滤可选课程：
  // - 学员有年级 X → 仅显示年级 X 的课程 + 未设年级的课程
  // - 学员无年级 → 显示全部课程
  const filteredCourses = useMemo(() => {
    if (!selectedStudent || !selectedStudent.grade) return courses
    return courses.filter((c) => !c.grade || c.grade === selectedStudent.grade)
  }, [courses, selectedStudent])

  // 选中学员：更新 studentId，若已选课程不再匹配新年级则清空
  const handleStudentSelect = (student: Student) => {
    setSelectedStudent(student)
    setForm((f) => {
      const next: EnrollmentForm = { ...f, studentId: student.id }
      if (f.courseId) {
        const stillValid =
          !student.grade ||
          courses.some((c) => c.id === f.courseId && (!c.grade || c.grade === student.grade))
        if (!stillValid) {
          next.courseId = ''
          next.unitPrice = ''
          next.paidAmount = ''
        }
      }
      return next
    })
    setError('')
  }

  // 搜索框内容变化：若与已选学员名不同，说明用户在重新搜索，清除已选
  const handleStudentQueryChange = (query: string) => {
    if (selectedStudent && query !== selectedStudent.name) {
      setSelectedStudent(null)
      setForm((f) => ({ ...f, studentId: '', courseId: '' }))
    }
  }

  // 应付金额预览 = 购课课时 × 单价（实时计算）
  const previewTotal =
    (parseInt(form.purchasedHours, 10) || 0) * (Number(form.unitPrice) || 0)

  // 余额抵扣预览：勾选使用余额时，抵扣 = min(学员余额, 实付)，现金补差 = 实付 - 抵扣
  const studentBalance = !isEdit ? Number(selectedStudent?.balance || 0) : 0
  const paidPreview = Number(form.paidAmount) || 0
  const balanceDeductPreview = form.useBalance
    ? Math.round(Math.min(studentBalance, paidPreview) * 100) / 100
    : 0
  const cashPaidPreview = Math.round((paidPreview - balanceDeductPreview) * 100) / 100

  const setField = <K extends keyof EnrollmentForm>(field: K, value: EnrollmentForm[K]) => {
    setForm((f) => ({ ...f, [field]: value }))
    setError('')
  }

  // 选课程：课程已无单价（单价改为报名时手填必填），仅记录 courseId
  const handleCourseChange = (courseId: string) => {
    setForm((f) => ({ ...f, courseId }))
    setError('')
  }

  // 改购课课时：若实付未被手动改，同步默认实付
  const handlePurchasedChange = (val: string) => {
    setForm((f) => {
      const next: EnrollmentForm = { ...f, purchasedHours: val }
      if (!paidTouched) {
        const ph = parseInt(val, 10)
        const up = Number(f.unitPrice)
        if (Number.isFinite(ph) && Number.isFinite(up)) {
          next.paidAmount = String(ph * up)
        }
      }
      return next
    })
    setError('')
  }

  // 改单价：若实付未被手动改，同步默认实付
  const handleUnitPriceChange = (val: string) => {
    setForm((f) => {
      const next: EnrollmentForm = { ...f, unitPrice: val }
      if (!paidTouched) {
        const ph = parseInt(f.purchasedHours, 10)
        const up = Number(val)
        if (Number.isFinite(ph) && Number.isFinite(up)) {
          next.paidAmount = String(ph * up)
        }
      }
      return next
    })
    setError('')
  }

  // 手动改实付金额：标记已触碰，不再自动同步
  const handlePaidChange = (val: string) => {
    setPaidTouched(true)
    setForm((f) => ({ ...f, paidAmount: val }))
    setError('')
  }

  const handleSave = async () => {
    setError('')

    // 学员/课程必选（新增模式）
    if (!isEdit) {
      if (!form.studentId) {
        setError('请选择学员')
        return
      }
      if (!form.courseId) {
        setError('请选择课程')
        return
      }
    }

    // 购课课时：必填、非负整数
    if (form.purchasedHours.trim() === '') {
      setError('请填写购课课时')
      return
    }
    const phNum = Number(form.purchasedHours)
    if (!Number.isFinite(phNum) || phNum < 0 || !Number.isInteger(phNum)) {
      setError('购课课时需为非负整数')
      return
    }

    // 赠课课时：非负整数（空视为 0）
    const ghNum = form.giftHours.trim() === '' ? 0 : Number(form.giftHours)
    if (!Number.isFinite(ghNum) || ghNum < 0 || !Number.isInteger(ghNum)) {
      setError('赠课课时需为非负整数')
      return
    }

    // 注意：允许购课=0 且 赠课=0，用于创建结转目标报名记录

    // 单价：非负数（空视为 0）
    const upNum = form.unitPrice.trim() === '' ? 0 : Number(form.unitPrice)
    if (!Number.isFinite(upNum) || upNum < 0) {
      setError('单价需为非负数')
      return
    }

    // 实付金额：非负数（空视为 0）
    const paidNum = form.paidAmount.trim() === '' ? 0 : Number(form.paidAmount)
    if (!Number.isFinite(paidNum) || paidNum < 0) {
      setError('实付金额需为非负数')
      return
    }

    setSaving(true)
    try {
      // 统一处理 API 结果：code===0 视为成功
      const applyResult = (r: { code: number; message: string }, successMsg: string): boolean => {
        if (r.code === 0) {
          showToast('success', successMsg)
          return true
        }
        setError(r.message || '操作失败')
        return false
      }

      let ok = false
      if (isEdit && enrollment) {
        // 编辑：传入 { id, purchasedHours, giftHours, unitPrice, paidAmount, status, expiredAt, note }
        // 课时为「绝对值」语义，后端按差值调整剩余
        const r = await updateEnrollment({
          id: enrollment.id,
          purchasedHours: phNum,
          giftHours: ghNum,
          unitPrice: upNum,
          paidAmount: paidNum,
          status: form.status,
          expiredAt: form.expiredAt,
          note: form.note.trim(),
        })
        ok = applyResult(r, '报名已更新')
      } else {
        // 新增：不传 id（后端生成）、不传 status/remainingPaidHours/remainingGiftHours/
        // totalAmount/enrolledAt/createdAt（后端计算/默认）。
        // paidAmount：仅当用户实付与默认应付（购课×单价）不一致时传入以覆盖默认值，
        // 一致时不传，由后端按默认值处理。
        const addPayload: Parameters<typeof addEnrollment>[0] = {
          studentId: form.studentId,
          courseId: form.courseId,
          purchasedHours: phNum,
          giftHours: ghNum,
          unitPrice: upNum,
          expiredAt: form.expiredAt,
          note: form.note.trim(),
          useBalance: form.useBalance,
        }
        const defaultPaid = round2(phNum * upNum)
        if (round2(paidNum) !== defaultPaid) {
          addPayload.paidAmount = round2(paidNum)
        }
        const r = await addEnrollment(addPayload)
        // 余额抵扣成功时，后端返回 balanceDeduct/cashPaid，拼接到成功提示
        const deductInfo = r.data?.balanceDeduct && r.data.balanceDeduct > 0
          ? `（余额抵扣 ${formatMoney(r.data.balanceDeduct)}，现金补差 ${formatMoney(r.data.cashPaid || 0)}）`
          : ''
        ok = applyResult(r, '报名已新增' + deductInfo)
      }

      if (ok) {
        await onSaved()
        onClose()
      }
    } catch (e) {
      const err = e as Error
      if (isAuthError(err)) {
        onAuthError(err)
      } else {
        setError(err.message || '操作失败')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? '编辑报名' : '新增报名'}
      onClose={onClose}
      size="md"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          loading={saving}
          confirmText={isEdit ? '保存' : '新增'}
          confirmDisabled={false}
        />
      }
    >
      <div className="space-y-4">
        {/* 必填说明 */}
        <div className="text-xs text-slate-400">
          <span className="text-rose-500">*</span> 为必填项
          {isEdit && <span className="ml-2">学员/课程不可修改</span>}
        </div>

        {/* 新增模式：学员/课程缺失时提示 */}
        {!isEdit && (students.length === 0 || courses.length === 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {students.length === 0 && '暂无学员数据，请先在学员管理中新增。'}
            {students.length === 0 && courses.length === 0 && ' '}
            {courses.length === 0 && '暂无课程数据，请先在课程管理中新增。'}
          </div>
        )}

        {/* 学员 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'学员'}
          </span>
          <div className="flex-1">
            {isEdit ? (
              // 编辑模式：学员不可修改，只读展示
              <div className="pt-2 text-sm text-slate-700">
                {studentMap.get(form.studentId)?.name || form.studentId}
                {studentMap.get(form.studentId)?.grade ? `（${studentMap.get(form.studentId)!.grade}）` : ''}
              </div>
            ) : (
              // 新增模式：复用搜索学员组件
              <>
                <SearchBar
                  onSelectStudent={handleStudentSelect}
                  onQueryChange={handleStudentQueryChange}
                  initialValue={selectedStudent?.name || ''}
                  containerClassName="max-w-none"
                />
                {selectedStudent && (
                  <div className="mt-1 text-xs text-slate-400">
                    {`已选：${selectedStudent.name}（${selectedStudent.grade || '不指定年级'}）`}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 课程 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'课程'}
          </span>
          <div className="flex-1">
            <select
              value={form.courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              className={cn(inputClass, 'bg-white')}
              disabled={isEdit}
            >
              <option value="">{'请选择课程'}</option>
              {/* 编辑模式下，若课程已被删除，补充显示其 id */}
              {isEdit && !courses.some((c) => c.id === form.courseId) && form.courseId && (
                <option value={form.courseId}>{form.courseId}（已缺失）</option>
              )}
              {(isEdit ? courses : filteredCourses).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade ? `（${c.grade}）` : ''}
                </option>
              ))}
            </select>
            {!isEdit && selectedStudent?.grade && filteredCourses.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">{'该年级暂无可选课程，请先在课程管理中为该年级添加课程'}</p>
            )}
            {!isEdit && selectedStudent?.grade && filteredCourses.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">{`仅显示「${selectedStudent.grade}」年级及未分级的课程`}</p>
            )}
          </div>
        </div>

        {/* 编辑模式：当前剩余（只读） */}
        {isEdit && enrollment && (
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">当前剩余</span>
            <div className="flex-1 pt-2 text-sm text-slate-600">
              付费剩余 {enrollment.remainingPaidHours} + 赠课剩余 {enrollment.remainingGiftHours}
              {' = '}
              {enrollment.remainingPaidHours + enrollment.remainingGiftHours}
            </div>
          </div>
        )}

        {/* 编辑模式：状态 */}
        {isEdit && (
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'状态'}</span>
            <select
              value={form.status}
              onChange={(e) => setField('status', e.target.value as EnrollmentStatus)}
              className={cn(inputClass, 'bg-white')}
            >
              <option value="active">进行中</option>
              <option value="settled">已结转</option>
              <option value="finished">已结课</option>
            </select>
          </div>
        )}

        {/* 购课课时 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'购课课时'}
          </span>
          <div className="flex-1 space-y-1">
            <input
              type="number"
              min={0}
              step={1}
              value={form.purchasedHours}
              onChange={(e) => handlePurchasedChange(e.target.value)}
              className={inputClass}
              placeholder="如：40"
            />
            <div className="text-xs text-slate-400">
              {isEdit
                ? '修改购课课时将按差额调整剩余；如原 40 改为 50，剩余 +10'
                : '报名的付费购课课时，点名时按课时扣减'}
            </div>
          </div>
        </div>

        {/* 赠课课时 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'赠课课时'}</span>
          <div className="flex-1 space-y-1">
            <input
              type="number"
              min={0}
              step={1}
              value={form.giftHours}
              onChange={(e) => setField('giftHours', e.target.value)}
              className={inputClass}
              placeholder="默认 0"
            />
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 leading-relaxed">
              {'提示：赠课不计入应付金额。如需将赠课计入总课时并参与单价计算，请把赠课直接累加进「购课课时」，并在备注中注明已赠课。'}
            </div>
          </div>
        </div>

        {/* 单价 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
            <span className="text-rose-500 mr-0.5">*</span>{'单价'}
          </span>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">¥</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.unitPrice}
                onChange={(e) => handleUnitPriceChange(e.target.value)}
                className={cn(inputClass, 'flex-1')}
                placeholder="每课时单价，如 200"
              />
            </div>
            <div className="text-xs text-slate-400">
              {isEdit ? '修改单价不影响已扣减的历史，仅影响后续显示' : '报名时锁定单价；可填 0 表示免费'}
            </div>
          </div>
        </div>

        {/* 实付金额 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'实付金额'}</span>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">¥</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.paidAmount}
                onChange={(e) => handlePaidChange(e.target.value)}
                className={cn(inputClass, 'flex-1')}
                placeholder="默认等于应付金额"
              />
            </div>
            <div className="text-xs text-slate-400">
              默认等于应付金额；如折扣或欠款可在此修改
            </div>
          </div>
        </div>

        {/* 应付金额（只读预览） */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'应付金额'}</span>
          <div className="flex-1 pt-2 text-sm text-slate-700 font-medium">
            {formatMoney(previewTotal)}
            <span className="ml-2 text-xs text-slate-400 font-normal">= 购课课时 × 单价</span>
          </div>
        </div>

        {/* 余额抵扣（仅新增模式 + 学员有余额时展示） */}
        {!isEdit && studentBalance > 0 && (
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'余额抵扣'}</span>
            <div className="flex-1 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.useBalance}
                  onChange={(e) => setField('useBalance', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">
                  {'使用账户余额抵扣'}
                  <span className="ml-2 text-xs text-slate-400">
                    {`当前余额 ${formatMoney(studentBalance)}`}
                  </span>
                </span>
              </label>
              {form.useBalance && (
                <div className="bg-brand-50 border border-brand-100 rounded-md px-3 py-2 text-xs text-slate-700 space-y-0.5">
                  <div>{`余额抵扣：${formatMoney(balanceDeductPreview)}`}</div>
                  <div>{`现金补差：${formatMoney(cashPaidPreview)}`}</div>
                  {cashPaidPreview <= 0 && (
                    <div className="text-brand-700">余额足以覆盖实付，无需现金补差</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 有效期 */}
        <Field label={'有效期'} hint={'到期后该报名自动失效；留空表示无有效期'}>
          <input
            type="date"
            value={form.expiredAt}
            onChange={(e) => setField('expiredAt', e.target.value)}
            className={inputClass}
          />
        </Field>

        {/* 备注 */}
        <div className="flex items-start gap-4">
          <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">{'备注'}</span>
          <textarea
            value={form.note}
            onChange={(e) => setField('note', e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="可选，如：续费、赠课原因等"
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
