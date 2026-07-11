import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Student, Course, Enrollment, Transfer, AccountTransaction } from '@/types'
import { cn } from '@/utils/cn'
import { fmtDateTime } from '@/utils/tz'
import { formatMoney } from '@/utils/money'
import { isAuthError } from '@/utils/auth'
import {
  listEnrollments,
  listCourses,
  listTransfers,
  listAccountTransactions,
  addTransfer,
} from '@/api/admin'
import { Button, EmptyState, inputClass, LoadingBlock, SubPageHeader } from '@/components/ui'
import { SearchBar } from '@/components/SearchBar'

interface TransferAdminProps {
  students: Student[]
  busy: boolean
  onBack: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  onAuthError: (e: Error) => void
  onStudentsChanged: () => void
}

const TX_TYPE_LABEL: Record<string, string> = {
  refund: '退课转入',
  enroll_deduct: '报名抵扣',
}

export function TransferAdmin({
  students,
  busy,
  onBack,
  showToast,
  onAuthError,
  onStudentsChanged,
}: TransferAdminProps) {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [transactions, setTransactions] = useState<AccountTransaction[]>([])
  const [studentEnrollments, setStudentEnrollments] = useState<Enrollment[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  // 选中学员
  const [studentId, setStudentId] = useState('')

  // 退课表单
  const [refundEnrollmentId, setRefundEnrollmentId] = useState('')
  const [giftMode, setGiftMode] = useState<'discard' | 'refund'>('discard')
  const [refundNote, setRefundNote] = useState('')
  const [refunding, setRefunding] = useState(false)

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  )
  const courseMap = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  )
  const enrollmentMap = useMemo(
    () => new Map(studentEnrollments.map((e) => [e.id, e])),
    [studentEnrollments],
  )

  const selectedStudent = studentId ? studentMap.get(studentId) : undefined

  // 课程列表只需加载一次（用于把 courseId 解析为课程名）
  useEffect(() => {
    let cancelled = false
    listCourses()
      .then((r) => {
        if (!cancelled && r.code === 0) setCourses(r.data.courses)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const reload = useCallback(async () => {
    if (!studentId) {
      setTransfers([])
      setTransactions([])
      setStudentEnrollments([])
      return
    }
    try {
      const [tr, tx, er] = await Promise.all([
        listTransfers({ studentId }),
        listAccountTransactions({ studentId }),
        listEnrollments({ studentId }),
      ])
      if (tr.code === 0) setTransfers(tr.data.transfers)
      if (tx.code === 0) setTransactions(tx.data.transactions)
      if (er.code === 0) setStudentEnrollments(er.data.enrollments)
    } catch (e) {
      const err = e as Error
      if (isAuthError(err)) onAuthError(err)
      else showToast('error', '加载数据失败：' + err.message)
    }
  }, [studentId, onAuthError, showToast])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setLoading(true)
      await reload()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [reload])

  // 退课下拉：该学员剩余课时 > 0 的 active 报名
  const refundableEnrollments = useMemo(
    () => studentEnrollments.filter(
      (e) => e.status === 'active' && e.remainingPaidHours + e.remainingGiftHours > 0,
    ),
    [studentEnrollments],
  )

  const handleStudentSelect = (student: Student) => {
    setStudentId(student.id)
    setRefundEnrollmentId('')
    setRefundNote('')
  }

  // 退课预览
  const refundPreview = useMemo(() => {
    const e = refundEnrollmentId ? enrollmentMap.get(refundEnrollmentId) : undefined
    if (!e) return null
    const paid = e.remainingPaidHours
    const gift = e.remainingGiftHours
    const refundHours = giftMode === 'refund' ? paid + gift : paid
    const amount = Math.round(refundHours * e.unitPrice * 100) / 100
    return { paid, gift, refundHours, amount, unitPrice: e.unitPrice }
  }, [refundEnrollmentId, enrollmentMap, giftMode])

  const handleRefund = async () => {
    if (!refundEnrollmentId) {
      showToast('error', '请选择要退课的报名记录')
      return
    }
    setRefunding(true)
    try {
      const r = await addTransfer({
        studentId,
        fromEnrollmentId: refundEnrollmentId,
        giftMode,
        note: refundNote.trim() || undefined,
      })
      if (r.code === 0) {
        showToast('success', `已退课，折算 ${formatMoney(r.data.refundAmount)} 入账户，余额 ${formatMoney(r.data.balanceAfter)}`)
        setRefundEnrollmentId('')
        setRefundNote('')
        await reload()
        onStudentsChanged()
      } else {
        showToast('error', r.message)
      }
    } catch (e) {
      const err = e as Error
      if (isAuthError(err)) onAuthError(err)
      else showToast('error', err.message)
    } finally {
      setRefunding(false)
    }
  }

  const courseNameByEnrollment = (enrollmentId: string): string => {
    const e = enrollmentMap.get(enrollmentId)
    if (!e) return '—'
    return courseMap.get(e.courseId)?.name || e.courseId
  }

  return (
    <div className="min-h-full bg-background">
      <SubPageHeader title={'结转退课'} onBack={onBack} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 学员搜索 + 余额展示 */}
        <section className="card p-5">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-brand-500 rounded"></span>
            搜索学员
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                <span className="text-destructive mr-0.5">*</span>{'学员'}
              </label>
              <SearchBar
                onSelectStudent={handleStudentSelect}
                onQueryChange={(q) => {
                  // 搜索内容与已选学员名不同时，清除已选
                  if (selectedStudent && q !== selectedStudent.name) {
                    setStudentId('')
                  }
                }}
                initialValue={selectedStudent?.name || ''}
                students={students}
                containerClassName="max-w-none"
              />
            </div>
            {selectedStudent && (
              <div className="flex items-end">
                <div className="bg-primary/10 border border-brand-100 rounded-md px-4 py-3 w-full">
                  <div className="text-xs text-brand-700 font-medium mb-1">账户余额</div>
                  <div className="text-2xl font-bold text-brand-700">{formatMoney(selectedStudent.balance || 0)}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {!studentId ? (
          <EmptyState title={'请先搜索学员'} description="选择学员后可进行退课操作，并查看账户流水" />
        ) : loading ? (
          <LoadingBlock />
        ) : (
          <>
            {/* 退课表单 */}
            <section className="card p-5">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-500 rounded"></span>
                退课（剩余课时折算入账户）
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    <span className="text-destructive mr-0.5">*</span>{'选择报名记录'}
                  </label>
                  {refundableEnrollments.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70 py-2 px-3 border border-dashed border-border rounded-md">
                      该学员无可退课的报名记录（需有剩余课时的进行中报名）
                    </p>
                  ) : (
                    <select
                      value={refundEnrollmentId}
                      onChange={(e) => setRefundEnrollmentId(e.target.value)}
                      className={cn(inputClass, 'bg-background')}
                    >
                      <option value="">请选择报名记录</option>
                      {refundableEnrollments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {courseNameByEnrollment(e.id)}（剩余 付费{e.remainingPaidHours}+赠课{e.remainingGiftHours}，单价 {formatMoney(e.unitPrice)}）
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">赠课处理方式</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGiftMode('discard')}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        giftMode === 'discard'
                          ? 'border-brand-400 bg-primary/10 text-brand-700'
                          : 'border-border text-muted-foreground hover:border-border',
                      )}
                    >
                      {'赠课作废（仅退付费课时）'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGiftMode('refund')}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        giftMode === 'refund'
                          ? 'border-brand-400 bg-primary/10 text-brand-700'
                          : 'border-border text-muted-foreground hover:border-border',
                      )}
                    >
                      {'赠课也折算'}
                    </button>
                  </div>
                </div>

                {refundPreview && (
                  <div className="bg-amber-50 border border-amber-100 rounded-md px-4 py-3">
                    <div className="text-xs text-amber-700 font-medium mb-1">退课预览</div>
                    <div className="text-sm text-foreground">
                      剩余 付费 {refundPreview.paid} + 赠课 {refundPreview.gift}（单价 {formatMoney(refundPreview.unitPrice)}）→
                      折算 {refundPreview.refundHours} 课时 = <span className="font-semibold">{formatMoney(refundPreview.amount)}</span> 入账户
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">备注（可选）</label>
                  <input
                    type="text"
                    value={refundNote}
                    onChange={(e) => setRefundNote(e.target.value)}
                    className={inputClass}
                    placeholder="如：升班退课"
                  />
                </div>

                <div className="text-xs text-muted-foreground/70">
                  退课后源报名标记为已结算，剩余课时清零；折算金额进入账户余额，可在新报名时用「余额抵扣」消耗。
                </div>

                <Button variant="primary" loading={refunding} disabled={busy || !refundEnrollmentId} onClick={handleRefund}>
                  {'确认退课'}
                </Button>
              </div>
            </section>

            {/* 账户流水 */}
            <section className="card p-5">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-1 h-4 bg-slate-400 rounded"></span>
                账户流水
              </h2>
              {transactions.length === 0 ? (
                <EmptyState title={'暂无账户流水'} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left py-2 px-2 font-medium">{'时间'}</th>
                        <th className="text-left py-2 px-2 font-medium">{'类型'}</th>
                        <th className="text-right py-2 px-2 font-medium">{'金额'}</th>
                        <th className="text-right py-2 px-2 font-medium">{'余额'}</th>
                        <th className="text-left py-2 px-2 font-medium">{'备注'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t) => {
                        const isIn = t.type === 'refund'
                        return (
                          <tr key={t.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                            <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap text-xs">{fmtDateTime(t.createdAt)}</td>
                            <td className="py-2.5 px-2 text-foreground">{TX_TYPE_LABEL[t.type] || t.type}</td>
                            <td className={cn('py-2.5 px-2 text-right font-medium', isIn ? 'text-emerald-600' : 'text-destructive')}>
                              {isIn ? '+' : '-'}{formatMoney(t.amount)}
                            </td>
                            <td className="py-2.5 px-2 text-right text-muted-foreground">{formatMoney(t.balanceAfter)}</td>
                            <td className="py-2.5 px-2 text-muted-foreground">{t.note || <span className="text-muted-foreground/40">—</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 退课记录 */}
            {transfers.length > 0 && (
              <section className="card p-5">
                <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-rose-400 rounded"></span>
                  退课记录
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left py-2 px-2 font-medium">{'时间'}</th>
                        <th className="text-left py-2 px-2 font-medium">{'源报名'}</th>
                        <th className="text-left py-2 px-2 font-medium">{'赠课处理'}</th>
                        <th className="text-right py-2 px-2 font-medium">{'退课金额'}</th>
                        <th className="text-left py-2 px-2 font-medium">{'备注'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((t) => (
                        <tr key={t.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                          <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap text-xs">{fmtDateTime(t.createdAt)}</td>
                          <td className="py-2.5 px-2 text-muted-foreground">{courseNameByEnrollment(t.fromEnrollmentId)}</td>
                          <td className="py-2.5 px-2 text-muted-foreground">{t.giftMode === 'refund' ? '赠课折算' : '赠课作废'}</td>
                          <td className="py-2.5 px-2 text-right text-foreground font-medium">{formatMoney(t.refundAmount)}</td>
                          <td className="py-2.5 px-2 text-muted-foreground">{t.note || <span className="text-muted-foreground/40">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
