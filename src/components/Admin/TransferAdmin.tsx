import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Student, Course, Enrollment, Transfer, TransferMode } from '@/types'
import { cn } from '@/utils/cn'
import { listEnrollments, listTransfers, addTransfer } from '@/api/admin'
import { Button, EmptyState, inputClass, LoadingBlock, SubPageHeader } from '@/components/ui'

interface TransferAdminProps {
  students: Student[]
  courses: Course[]
  busy: boolean
  onBack: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  onAuthError: (e: Error) => void
}

// 金额格式化：整数显示 ¥200，非整数显示 ¥200.50
// 先规整浮点误差（四舍五入到 2 位），避免 2000.0000001 被判为非整数
function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '¥0'
  const rounded = Math.round(n * 100) / 100
  return '¥' + (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2))
}

// 时间格式化：ISO → yyyy-MM-dd HH:mm
function formatTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 判断是否为鉴权错误（401）：request 在 401 时抛出含「未登录/登录已过期」的 Error
function isAuthError(e: Error): boolean {
  const msg = e.message || ''
  return msg.includes('未登录') || msg.includes('登录已过期') || msg.includes('401')
}

export function TransferAdmin({
  students,
  courses,
  busy,
  onBack,
  showToast,
  onAuthError,
}: TransferAdminProps) {
  const { t } = useTranslation()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)

  // 表单状态
  const [studentId, setStudentId] = useState('')
  const [fromEnrollmentId, setFromEnrollmentId] = useState('')
  const [toEnrollmentId, setToEnrollmentId] = useState('')
  // 目标报名模式：existing = 选择已有报名；new = 新建目标报名（升班结转）
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing')
  // 新建目标报名所选的课程 ID
  const [newTargetCourseId, setNewTargetCourseId] = useState('')
  const [mode, setMode] = useState<TransferMode>('amount')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 映射表：enrollment / course / student
  const enrollmentMap = useMemo(
    () => new Map(enrollments.map((e) => [e.id, e])),
    [enrollments],
  )
  const courseMap = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  )
  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  )

  // 加载全部结转流水 + 全部报名记录（报名用于映射课程名 + 前端过滤学员 active 报名）
  const reload = useCallback(async () => {
    try {
      const [tr, er] = await Promise.all([listTransfers(), listEnrollments()])
      if (tr.code === 0) setTransfers(tr.data.transfers)
      if (er.code === 0) setEnrollments(er.data.enrollments)
    } catch (e) {
      const err = e as Error
      if (isAuthError(err)) {
        onAuthError(err)
      } else {
        showToast('error', '加载数据失败：' + err.message)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // mount 时加载全部 transfers 和 enrollments
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setLoading(true)
      await reload()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [reload])

  // 选定学员的 active 报名记录（复用已加载的全部 enrollment 在前端过滤）
  const studentActiveEnrollments = useMemo(() => {
    if (!studentId) return []
    return enrollments.filter(
      (e) => e.studentId === studentId && e.status === 'active',
    )
  }, [enrollments, studentId])

  // 源报名下拉：仅显示 remaining > 0 的
  const sourceOptions = useMemo(
    () =>
      studentActiveEnrollments.filter(
        (e) => e.remainingPaidHours + e.remainingGiftHours > 0,
      ),
    [studentActiveEnrollments],
  )

  // 目标报名下拉：排除源
  const targetOptions = useMemo(
    () => studentActiveEnrollments.filter((e) => e.id !== fromEnrollmentId),
    [studentActiveEnrollments, fromEnrollmentId],
  )

  const sourceEnrollment = fromEnrollmentId
    ? enrollmentMap.get(fromEnrollmentId)
    : undefined
  const targetEnrollment = toEnrollmentId
    ? enrollmentMap.get(toEnrollmentId)
    : undefined
  // 新建目标报名所选课程（升班结转时目标报名尚不存在，用课程单价预览）
  const newTargetCourse = newTargetCourseId
    ? courseMap.get(newTargetCourseId)
    : undefined

  // 实时预览：选定源 + 目标 + 方式后计算
  // 目标单价来源：existing 模式取 targetEnrollment.unitPrice；new 模式取 newTargetCourse.unitPrice
  const preview = useMemo(() => {
    if (!sourceEnrollment) return null
    const fromPrice = sourceEnrollment.unitPrice
    const toPrice =
      targetMode === 'new'
        ? newTargetCourse?.unitPrice ?? 0
        : targetEnrollment?.unitPrice ?? 0
    const hasTarget = targetMode === 'new' ? !!newTargetCourse : !!targetEnrollment
    if (!hasTarget) return null
    if (mode === 'amount') {
      if (toPrice <= 0) {
        return { kind: 'amount-error' as const, reason: '目标课程单价为 0，无法按金额折算' }
      }
      const totalHours = sourceEnrollment.remainingPaidHours + sourceEnrollment.remainingGiftHours
      const amount = totalHours * fromPrice
      const targetHours = Math.floor(amount / toPrice)
      const leftover = amount - targetHours * toPrice
      return {
        kind: 'amount' as const,
        totalHours,
        fromPrice,
        amount,
        toPrice,
        targetHours,
        leftover,
      }
    }
    return {
      kind: 'hours' as const,
      paid: sourceEnrollment.remainingPaidHours,
      gift: sourceEnrollment.remainingGiftHours,
    }
  }, [sourceEnrollment, targetEnrollment, newTargetCourse, targetMode, mode])

  // 结转流水按时间倒序
  const sortedTransfers = useMemo(() => {
    return [...transfers].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })
  }, [transfers])

  const handleStudentChange = (id: string) => {
    setStudentId(id)
    setFromEnrollmentId('')
    setToEnrollmentId('')
    setNewTargetCourseId('')
    setTargetMode('existing')
  }

  const handleFromChange = (id: string) => {
    setFromEnrollmentId(id)
    // 若目标与新选源相同，清空目标
    if (toEnrollmentId === id) {
      setToEnrollmentId('')
    }
  }

  const resetForm = () => {
    setStudentId('')
    setFromEnrollmentId('')
    setToEnrollmentId('')
    setNewTargetCourseId('')
    setTargetMode('existing')
    setMode('amount')
    setNote('')
  }

  const handleSubmit = async () => {
    if (!studentId) {
      showToast('error', '请选择学员')
      return
    }
    if (!fromEnrollmentId) {
      showToast('error', '请选择源报名记录')
      return
    }
    if (targetMode === 'existing') {
      if (!toEnrollmentId) {
        showToast('error', '请选择目标报名记录')
        return
      }
      if (fromEnrollmentId === toEnrollmentId) {
        showToast('error', '源报名与目标报名不能相同')
        return
      }
    } else {
      // new 模式：必须选择目标课程
      if (!newTargetCourseId) {
        showToast('error', t('transfer.selectNewCourse'))
        return
      }
    }
    setSubmitting(true)
    try {
      const result =
        targetMode === 'existing'
          ? await addTransfer({
              studentId,
              fromEnrollmentId,
              toEnrollmentId,
              mode,
              note: note.trim() || undefined,
            })
          : await addTransfer({
              studentId,
              fromEnrollmentId,
              newTargetEnrollment: {
                courseId: newTargetCourseId,
                unitPrice: newTargetCourse?.unitPrice,
              },
              mode,
              note: note.trim() || undefined,
            })
      if (result.code === 0) {
        showToast('success', targetMode === 'new' ? t('transfer.newTargetCreated') : t('transfer.success'))
        resetForm()
        // 刷新流水与报名（源/目标剩余已变）
        await reload()
      } else {
        // 业务失败（如源无剩余、非同学员）
        showToast('error', result.message)
      }
    } catch (e) {
      const err = e as Error
      if (isAuthError(err)) {
        onAuthError(err)
      } else {
        showToast('error', err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // 报名下拉标签：课程名（剩余 X 课时，单价 ¥Y）
  const enrollmentLabel = (e: Enrollment): string => {
    const courseName = courseMap.get(e.courseId)?.name || '未知课程'
    const remaining = e.remainingPaidHours + e.remainingGiftHours
    return `${courseName}（剩余 ${remaining} 课时，单价 ${formatMoney(e.unitPrice)}）`
  }

  const courseNameByEnrollment = (enrollmentId: string): string => {
    const e = enrollmentMap.get(enrollmentId)
    if (!e) return '—'
    return courseMap.get(e.courseId)?.name || '—'
  }

  const studentName = (id: string): string =>
    studentMap.get(id)?.name || '—'

  const modeText = (m: TransferMode): string =>
    m === 'amount' ? t('transfer.modeByAmount') : t('transfer.modeByHours')

  const canSubmit =
    !!studentId &&
    !!fromEnrollmentId &&
    (targetMode === 'existing'
      ? !!toEnrollmentId && fromEnrollmentId !== toEnrollmentId
      : !!newTargetCourseId)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <SubPageHeader title={t('transfer.title')} onBack={onBack} count={transfers.length} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 新增结转区 */}
        <section className="card p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-brand-500 rounded"></span>
            新增结转
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 学员 */}
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">
                <span className="text-rose-500 mr-0.5">*</span>{t('transfer.student')}
              </label>
              <select
                value={studentId}
                onChange={(e) => handleStudentChange(e.target.value)}
                className={cn(inputClass, 'bg-white')}
              >
                <option value="">请选择学员</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* 结转方式 */}
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">
                <span className="text-rose-500 mr-0.5">*</span>{t('transfer.mode')}
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as TransferMode)}
                className={cn(inputClass, 'bg-white')}
              >
                <option value="amount">按金额折算</option>
                <option value="hours">按课时平移</option>
              </select>
            </div>

            {/* 源报名记录 */}
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">
                <span className="text-rose-500 mr-0.5">*</span>{t('transfer.fromEnrollment')}
              </label>
              {!studentId ? (
                <select disabled className={cn(inputClass, 'bg-white text-slate-400')}>
                  <option value="">请先选择学员</option>
                </select>
              ) : sourceOptions.length === 0 ? (
                <select disabled className={cn(inputClass, 'bg-white text-slate-400')}>
                  <option value="">该学员无可用源报名记录</option>
                </select>
              ) : (
                <select
                  value={fromEnrollmentId}
                  onChange={(e) => handleFromChange(e.target.value)}
                  className={cn(inputClass, 'bg-white')}
                >
                  <option value="">请选择源报名</option>
                  {sourceOptions.map((e) => (
                    <option key={e.id} value={e.id}>{enrollmentLabel(e)}</option>
                  ))}
                </select>
              )}
            </div>

            {/* 目标报名记录 */}
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">
                <span className="text-rose-500 mr-0.5">*</span>{t('transfer.toEnrollment')}
              </label>
              {!studentId ? (
                <select disabled className={cn(inputClass, 'bg-white text-slate-400')}>
                  <option value="">请先选择学员</option>
                </select>
              ) : (
                <div className="space-y-2">
                  {/* 目标模式切换：选择已有报名 / 新建目标报名（升班结转） */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetMode('existing')}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        targetMode === 'existing'
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300',
                      )}
                    >
                      {t('transfer.selectExisting')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetMode('new')}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        targetMode === 'new'
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300',
                      )}
                    >
                      {t('transfer.newTarget')}
                    </button>
                  </div>

                  {targetMode === 'existing' ? (
                    targetOptions.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 px-3 border border-dashed border-slate-200 rounded-md">
                        该学员无其他可转入的课程报名记录，可点击「{t('transfer.newTarget')}」直接新建
                      </p>
                    ) : (
                      <select
                        value={toEnrollmentId}
                        onChange={(e) => setToEnrollmentId(e.target.value)}
                        className={cn(inputClass, 'bg-white')}
                      >
                        <option value="">请选择目标报名</option>
                        {targetOptions.map((e) => (
                          <option key={e.id} value={e.id}>{enrollmentLabel(e)}</option>
                        ))}
                      </select>
                    )
                  ) : (
                    <>
                      <p className="text-xs text-slate-400">{t('transfer.newTargetHint')}</p>
                      <select
                        value={newTargetCourseId}
                        onChange={(e) => setNewTargetCourseId(e.target.value)}
                        className={cn(inputClass, 'bg-white')}
                      >
                        <option value="">{t('transfer.selectNewCourse')}</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.grade ? `（${c.grade}）` : ''}
                            {typeof c.unitPrice === 'number' && c.unitPrice > 0
                              ? `（¥${c.unitPrice}/课时）`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 方式说明 */}
          <div className="mt-3 text-xs text-slate-400">
            {mode === 'amount'
              ? '按金额：源剩余价值折算为金额，再除以目标单价得到目标课时'
              : '按课时：付费课时→付费，赠课→赠课'}
          </div>

          {/* 备注 */}
          <div className="mt-4">
            <label className="block text-sm text-slate-500 mb-1.5">备注（可选）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="可填写结转原因、备注等"
            />
          </div>

          {/* 实时预览 */}
          {preview && (
            <div className="mt-4 bg-brand-50 border border-brand-100 rounded-md px-4 py-3">
              <div className="text-xs text-brand-700 font-medium mb-1">结转预览</div>
              {preview.kind === 'amount-error' && (
                <div className="text-sm text-rose-600">{preview.reason}</div>
              )}
              {preview.kind === 'amount' && (
                <div className="text-sm text-slate-700">
                  源剩余 {preview.totalHours} 课时 × {formatMoney(preview.fromPrice)} = {formatMoney(preview.amount)} → 目标新增 {preview.targetHours} 课时（零头 {formatMoney(preview.leftover)}）
                </div>
              )}
              {preview.kind === 'hours' && (
                <div className="text-sm text-slate-700">
                  源剩余 付费 {preview.paid} + 赠课 {preview.gift} → 目标新增 付费 {preview.paid} + 赠课 {preview.gift}
                </div>
              )}
            </div>
          )}

          {/* 提交 */}
          <div className="mt-4 flex justify-end">
            <Button variant="primary" loading={submitting} disabled={!canSubmit || busy} onClick={handleSubmit}>
              {t('transfer.confirmTransfer')}
            </Button>
          </div>
        </section>

        {/* 结转流水列表 */}
        {loading ? (
          <LoadingBlock />
        ) : sortedTransfers.length === 0 ? (
          <EmptyState title={t('transfer.noRecords')} />
        ) : (
          <section className="card p-5">
            <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-brand-500 rounded"></span>
              结转流水
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{t('common.time')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('transfer.student')}</th>
                    <th className="text-left py-2 px-2 font-medium">源课程→目标课程</th>
                    <th className="text-left py-2 px-2 font-medium">方式</th>
                    <th className="text-left py-2 px-2 font-medium">{t('transfer.transferredHours')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('transfer.transferredAmount')}</th>
                    <th className="text-left py-2 px-2 font-medium">零头</th>
                    <th className="text-left py-2 px-2 font-medium">{t('common.remark')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransfers.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap text-xs">
                        {formatTime(t.createdAt)}
                      </td>
                      <td className="py-2.5 px-2 text-slate-700 font-medium">
                        {studentName(t.studentId)}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {courseNameByEnrollment(t.fromEnrollmentId)} → {courseNameByEnrollment(t.toEnrollmentId)}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{modeText(t.mode)}</td>
                      <td className="py-2.5 px-2 text-slate-600">{t.transferredHours}</td>
                      <td className="py-2.5 px-2 text-slate-600">{formatMoney(t.transferredAmount)}</td>
                      <td className="py-2.5 px-2 text-slate-600">{formatMoney(t.leftoverAmount)}</td>
                      <td className="py-2.5 px-2 text-slate-500">
                        {t.note || <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
