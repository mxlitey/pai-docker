import { getDb, validateStorageId } from './core.js'
import { genTransferId, genEnrollmentId } from '../id.js'

// ========== 行 <-> 对象 映射 ==========
function rowToTransfer(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    fromEnrollmentId: r.from_enrollment_id,
    toEnrollmentId: r.to_enrollment_id,
    mode: r.mode,
    transferredHours: r.transferred_hours ?? 0,
    transferredAmount: typeof r.transferred_amount === 'number' ? r.transferred_amount : Number(r.transferred_amount || 0),
    leftoverAmount: typeof r.leftover_amount === 'number' ? r.leftover_amount : Number(r.leftover_amount || 0),
    fromUnitPrice: typeof r.from_unit_price === 'number' ? r.from_unit_price : Number(r.from_unit_price || 0),
    toUnitPrice: typeof r.to_unit_price === 'number' ? r.to_unit_price : Number(r.to_unit_price || 0),
    operatorId: r.operator_id || '',
    reason: r.reason || '',
    note: r.note || '',
    createdAt: r.created_at || '',
  }
}

// ========== 结转 ==========
// mode: 'amount'（默认，按金额折算）/ 'hours'（按课时平移）
export async function addTransfer(transfer) {
  const db = getDb()
  const id = transfer?.id || genTransferId()
  validateStorageId(id, 'transfer.id')
  validateStorageId(transfer?.studentId, 'transfer.studentId')
  validateStorageId(transfer?.fromEnrollmentId, 'transfer.fromEnrollmentId')
  // 目标报名：可传 toEnrollmentId（已有报名），或传 newTargetEnrollment（升班后新建目标报名）
  const hasExistingTarget = !!transfer?.toEnrollmentId
  const hasNewTarget = !!transfer?.newTargetEnrollment
  if (!hasExistingTarget && !hasNewTarget) {
    return { created: false, reason: '缺少 toEnrollmentId 或 newTargetEnrollment（目标报名记录）' }
  }
  if (hasExistingTarget) {
    validateStorageId(transfer.toEnrollmentId, 'transfer.toEnrollmentId')
    if (transfer.fromEnrollmentId === transfer.toEnrollmentId) {
      return { created: false, reason: '源与目标报名记录不能相同' }
    }
  }
  // 校验新建目标报名必要字段
  if (hasNewTarget) {
    const nt = transfer.newTargetEnrollment
    validateStorageId(nt?.courseId, 'newTargetEnrollment.courseId')
    if (!db.prepare('SELECT 1 FROM courses WHERE id=?').get(nt.courseId)) {
      throw new Error('目标报名所关联的课程不存在')
    }
  }

  const tx = db.transaction(() => {
    const from = db.prepare('SELECT * FROM enrollments WHERE id=?').get(transfer.fromEnrollmentId)
    if (!from) throw new Error('源报名记录不存在')
    if (from.status !== 'active') throw new Error('源报名记录非进行中，不可结转')

    // 解析目标报名记录：已有则取，新建则在事务内创建（初始 0 课时，由结转注入）
    let to
    let toEnrollmentId
    let createdTargetId = null
    if (hasExistingTarget) {
      to = db.prepare('SELECT * FROM enrollments WHERE id=?').get(transfer.toEnrollmentId)
      if (!to) throw new Error('目标报名记录不存在')
      if (from.student_id !== to.student_id) throw new Error('结转仅支持同一学员的报名记录')
      if (to.status !== 'active') throw new Error('目标报名记录非进行中，不可结转')
      toEnrollmentId = to.id
    } else {
      const nt = transfer.newTargetEnrollment
      // 升班场景：学员在新年级还没报名，结转时即时创建一条 0 课时目标报名
      toEnrollmentId = genEnrollmentId()
      createdTargetId = toEnrollmentId
      const course = db.prepare('SELECT * FROM courses WHERE id=?').get(nt.courseId)
      const unitPrice = Number(nt.unitPrice ?? course?.unit_price ?? 0)
      db.prepare(`INSERT INTO enrollments
        (id, student_id, course_id, status, purchased_hours, gift_hours, remaining_paid_hours, remaining_gift_hours,
         unit_price, total_amount, paid_amount, discount_amount, channel, sales_id, payment_method, payment_status,
         contract_no, expired_at, operator_id, enrolled_at, note)
        VALUES (?, ?, ?, 'active', 0, 0, 0, 0, ?, 0, 0, 0, '', '', '', 'paid', '', ?, ?, ?, ?)`).run(
        toEnrollmentId,
        from.student_id,
        nt.courseId,
        unitPrice,
        nt.expiredAt || '',
        nt.operatorId || transfer.operatorId || '',
        nt.enrolledAt || new Date().toISOString(),
        nt.note || '升班结转自动创建',
      )
      to = db.prepare('SELECT * FROM enrollments WHERE id=?').get(toEnrollmentId)
    }

    const fromRemainingPaid = from.remaining_paid_hours
    const fromRemainingGift = from.remaining_gift_hours
    const fromTotalRemaining = fromRemainingPaid + fromRemainingGift
    if (fromTotalRemaining <= 0) throw new Error('源报名记录无剩余课时，不可结转')

    const mode = transfer.mode === 'hours' ? 'hours' : 'amount'
    const fromUnitPrice = Number(from.unit_price || 0)
    const toUnitPrice = Number(to.unit_price || 0)

    let transferredHours = 0
    let transferredAmount = 0
    let leftoverAmount = 0
    let toPurchasedAdd = 0
    let toGiftAdd = 0

    if (mode === 'hours') {
      transferredHours = fromTotalRemaining
      transferredAmount = fromTotalRemaining * fromUnitPrice
      toPurchasedAdd = fromRemainingPaid
      toGiftAdd = fromRemainingGift
    } else {
      transferredHours = fromTotalRemaining
      transferredAmount = fromTotalRemaining * fromUnitPrice
      if (toUnitPrice > 0) {
        toPurchasedAdd = Math.floor(transferredAmount / toUnitPrice)
        leftoverAmount = Math.round((transferredAmount - toPurchasedAdd * toUnitPrice) * 100) / 100
      } else {
        toPurchasedAdd = 0
        leftoverAmount = transferredAmount
      }
    }

    db.prepare(`UPDATE enrollments SET remaining_paid_hours=0, remaining_gift_hours=0, status='settled' WHERE id=?`)
      .run(from.id)
    db.prepare(`UPDATE enrollments SET
      purchased_hours = purchased_hours + ?,
      remaining_paid_hours = remaining_paid_hours + ?,
      gift_hours = gift_hours + ?,
      remaining_gift_hours = remaining_gift_hours + ?,
      total_amount = total_amount + ?,
      paid_amount = paid_amount + ?
      WHERE id=?`).run(
      toPurchasedAdd, toPurchasedAdd,
      toGiftAdd, toGiftAdd,
      transferredAmount, transferredAmount,
      toEnrollmentId,
    )

    db.prepare(`INSERT INTO transfers
      (id, student_id, from_enrollment_id, to_enrollment_id, mode, transferred_hours, transferred_amount,
       leftover_amount, from_unit_price, to_unit_price, operator_id, reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      transfer.studentId,
      transfer.fromEnrollmentId,
      toEnrollmentId,
      mode,
      transferredHours,
      transferredAmount,
      leftoverAmount,
      fromUnitPrice,
      toUnitPrice,
      transfer.operatorId || '',
      transfer.reason || '',
      transfer.note || '',
    )

    return {
      id,
      mode,
      transferredHours,
      transferredAmount,
      leftoverAmount,
      toPurchasedAdd,
      toGiftAdd,
      toEnrollmentId,
      createdTargetEnrollmentId: createdTargetId,
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
  sql += ' ORDER BY datetime(created_at) DESC, id DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToTransfer)
}
