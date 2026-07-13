import { getDb, validateStorageId } from './core.js'
import { genTransferId } from '../id.js'
import { now, today } from '../time.js'
import { adjustBalanceTx } from './accounts.js'

// ========== 退课/结转流水 ==========
// 新模型：退课 = 源报名剩余课时折算成金额 → 存入学员账户余额。
// transfers 表记录每次退课动作（from_enrollment_id + refund_amount + gift_mode）。
// to_enrollment_id 可选：若退课后立即新报名可关联，拆分模式下通常为空。
// gift_mode: 'discard'（赠课作废不退钱）/ 'refund'（赠课也按单价折算）

function rowToTransfer(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    fromEnrollmentId: r.from_enrollment_id || '',
    toEnrollmentId: r.to_enrollment_id || '',
    refundAmount: typeof r.refund_amount === 'number' ? r.refund_amount : Number(r.refund_amount || 0),
    giftMode: r.gift_mode || 'discard',
    operatorId: r.operator_id || '',
    reason: r.reason || '',
    note: r.note || '',
    createdAt: r.created_at || '',
  }
}

// 退课：源报名剩余课时折算进学员账户余额
// giftMode: 'discard' 仅付费课时折算（赠课作废）；'refund' 付费+赠课都折算
export async function refundEnrollment({ transfer }) {
  const db = getDb()
  const id = transfer?.id || genTransferId()
  validateStorageId(id, 'transfer.id')
  validateStorageId(transfer?.studentId, 'transfer.studentId')
  validateStorageId(transfer?.fromEnrollmentId, 'transfer.fromEnrollmentId')
  const giftMode = transfer?.giftMode === 'refund' ? 'refund' : 'discard'

  const tx = db.transaction(() => {
    const from = db.prepare('SELECT * FROM enrollments WHERE id=?').get(transfer.fromEnrollmentId)
    if (!from) throw new Error('源报名记录不存在')
    if (from.status !== 'active') throw new Error('源报名记录非进行中，不可退课')
    if (from.student_id !== transfer.studentId) throw new Error('报名记录不属于该学员')

    const remainingPaid = Number(from.remaining_paid_hours || 0)
    const remainingGift = Number(from.remaining_gift_hours || 0)
    if (remainingPaid + remainingGift <= 0) throw new Error('源报名记录无剩余课时，不可退课')

    const unitPrice = Number(from.unit_price || 0)
    // 付费课时始终折算；赠课按 giftMode 决定
    const refundHours = giftMode === 'refund'
      ? remainingPaid + remainingGift
      : remainingPaid
    const refundAmount = Math.round(refundHours * unitPrice * 100) / 100

    // 源报名清零并标记 settled
    db.prepare(`UPDATE enrollments SET remaining_paid_hours=0, remaining_gift_hours=0, status='settled' WHERE id=?`)
      .run(from.id)

    // 退课后取消该学员该课程未来未点名的排课（date >= 今天 且 attended IS NULL）
    // 已点名的历史排课保留，未来排课取消避免点名时找不到 active 报名记录
    // 同时取消插班补课生成的排课（其 makeup_for 指向该课程的原排课），避免漏掉孤儿排课
    const todayStr = today()
    const cancelInfo = db.prepare(
      `UPDATE schedules SET status='cancelled'
       WHERE student_id=? AND date>=? AND attended IS NULL AND status='scheduled'
         AND (course_id=? OR makeup_for IN (
           SELECT id FROM schedules WHERE student_id=? AND course_id=?
         ))`
    ).run(transfer.studentId, todayStr, from.course_id, transfer.studentId, from.course_id)

    // 金额进学员账户余额（仅当金额 > 0）
    let balanceAfter = Number(db.prepare('SELECT balance FROM students WHERE id=?').get(transfer.studentId)?.balance || 0)
    if (refundAmount > 0) {
      const r = adjustBalanceTx(db, {
        studentId: transfer.studentId,
        type: 'refund',
        amount: refundAmount,
        direction: 'in',
        refType: 'enrollment',
        refId: from.id,
        operatorId: transfer.operatorId || '',
        note: transfer.note || `退课转入：${refundHours} 课时 × ¥${unitPrice}`,
      })
      balanceAfter = r.balanceAfter
    }

    db.prepare(`INSERT INTO transfers
      (id, student_id, from_enrollment_id, to_enrollment_id, refund_amount, gift_mode, operator_id, reason, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      transfer.studentId,
      transfer.fromEnrollmentId,
      transfer.toEnrollmentId || '',
      refundAmount,
      giftMode,
      transfer.operatorId || '',
      transfer.reason || '',
      transfer.note || '',
      now(),
    )

    return {
      id,
      refundAmount,
      refundHours,
      giftMode,
      settledEnrollmentId: from.id,
      balanceAfter,
      cancelledSchedules: cancelInfo.changes || 0,
    }
  })

  const result = tx()
  return { created: true, ...result }
}

export async function getTransfers({ studentId } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM transfers WHERE 1=1'
  const params = []
  if (studentId) { sql += ' AND student_id=?'; params.push(studentId) }
  sql += ' ORDER BY created_at DESC, id DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToTransfer)
}
