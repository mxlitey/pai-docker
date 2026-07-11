import { getDb, validateStorageId } from './core.js'
import { genEnrollmentId } from '../id.js'
import { now, today } from '../time.js'
import { adjustBalanceTx } from './accounts.js'

// ========== 行 <-> 对象 映射 ==========
function rowToEnrollment(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    courseId: r.course_id,
    status: r.status || 'active',
    purchasedHours: r.purchased_hours ?? 0,
    giftHours: r.gift_hours ?? 0,
    remainingPaidHours: r.remaining_paid_hours ?? 0,
    remainingGiftHours: r.remaining_gift_hours ?? 0,
    unitPrice: typeof r.unit_price === 'number' ? r.unit_price : Number(r.unit_price || 0),
    totalAmount: typeof r.total_amount === 'number' ? r.total_amount : Number(r.total_amount || 0),
    paidAmount: typeof r.paid_amount === 'number' ? r.paid_amount : Number(r.paid_amount || 0),
    discountAmount: typeof r.discount_amount === 'number' ? r.discount_amount : Number(r.discount_amount || 0),
    paymentMethod: r.payment_method || '',
    paymentStatus: r.payment_status || 'paid',
    contractNo: r.contract_no || '',
    expiredAt: r.expired_at || '',
    operatorId: r.operator_id || '',
    enrolledAt: r.enrolled_at || '',
    note: r.note || '',
    createdAt: r.created_at || '',
  }
}

// ========== 报名记录（计费核心） ==========
export async function getEnrollments({ studentId, courseId, status } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM enrollments WHERE 1=1'
  const params = []
  if (studentId) { sql += ' AND student_id=?'; params.push(studentId) }
  if (courseId) { sql += ' AND course_id=?'; params.push(courseId) }
  if (status) { sql += ' AND status=?'; params.push(status) }
  sql += ' ORDER BY datetime(enrolled_at), datetime(created_at), id'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToEnrollment)
}

export async function getEnrollment(id) {
  const db = getDb()
  return rowToEnrollment(db.prepare('SELECT * FROM enrollments WHERE id=?').get(id))
}

// 点名扣减时定位报名记录：学员+课程下，取最早报名且仍有剩余的 active 记录
export async function findActiveEnrollmentForAttendance(studentId, courseId) {
  const db = getDb()
  const withRemaining = db.prepare(`SELECT * FROM enrollments
    WHERE student_id=? AND course_id=? AND status='active' AND (remaining_paid_hours > 0 OR remaining_gift_hours > 0)
    ORDER BY datetime(enrolled_at), datetime(created_at) LIMIT 1`).get(studentId, courseId)
  if (withRemaining) return rowToEnrollment(withRemaining)
  const anyActive = db.prepare(`SELECT * FROM enrollments
    WHERE student_id=? AND course_id=? AND status='active'
    ORDER BY datetime(enrolled_at), datetime(created_at) LIMIT 1`).get(studentId, courseId)
  return rowToEnrollment(anyActive)
}

export async function addEnrollment(enrollment) {
  const db = getDb()
  const id = enrollment?.id || genEnrollmentId()
  validateStorageId(id, 'enrollment.id')
  validateStorageId(enrollment?.studentId, 'enrollment.studentId')
  validateStorageId(enrollment?.courseId, 'enrollment.courseId')

  const useBalance = !!enrollment.useBalance
  const tx = db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(enrollment.studentId)) {
      return { created: false, notFound: 'student' }
    }
    if (!db.prepare('SELECT 1 FROM courses WHERE id=?').get(enrollment.courseId)) {
      return { created: false, notFound: 'course' }
    }
    if (db.prepare('SELECT 1 FROM enrollments WHERE id=?').get(id)) {
      return { created: false, exists: true }
    }
    const purchased = Number(enrollment.purchasedHours || 0)
    const gift = Number(enrollment.giftHours || 0)
    const unitPrice = Number(enrollment.unitPrice || 0)
    const totalAmount = Number(enrollment.totalAmount ?? (purchased * unitPrice))
    let paidAmount = Number(enrollment.paidAmount ?? totalAmount)

    if (purchased <= 0) {
      return { created: false, invalid: '购课课时必须大于 0' }
    }

    // 余额抵扣：从学员账户余额扣除 min(余额, paidAmount)，剩余为现金补差
    let balanceDeduct = 0
    let balanceAfter = 0
    if (useBalance && paidAmount > 0) {
      const stu = db.prepare('SELECT balance FROM students WHERE id=?').get(enrollment.studentId)
      const cur = Number(stu?.balance || 0)
      balanceDeduct = Math.min(cur, paidAmount)
      balanceDeduct = Math.round(balanceDeduct * 100) / 100
      if (balanceDeduct > 0) {
        const r = adjustBalanceTx(db, {
          studentId: enrollment.studentId,
          type: 'enroll_deduct',
          amount: balanceDeduct,
          direction: 'out',
          refType: 'enrollment',
          refId: id,
          operatorId: enrollment.operatorId || '',
          note: `报名抵扣：${enrollment.courseId}`,
        })
        balanceAfter = r.balanceAfter
      }
    }

    db.prepare(`INSERT INTO enrollments
      (id, student_id, course_id, status, purchased_hours, gift_hours, remaining_paid_hours, remaining_gift_hours,
       unit_price, total_amount, paid_amount, discount_amount, payment_method, payment_status,
       contract_no, expired_at, operator_id, enrolled_at, note)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      enrollment.studentId,
      enrollment.courseId,
      purchased,
      gift,
      purchased,
      gift,
      unitPrice,
      totalAmount,
      paidAmount,
      Number(enrollment.discountAmount || 0),
      enrollment.paymentMethod || '',
      enrollment.paymentStatus || 'paid',
      enrollment.contractNo || '',
      enrollment.expiredAt || '',
      enrollment.operatorId || '',
      enrollment.enrolledAt || now(),
      enrollment.note || '',
    )
    return {
      created: true,
      exists: false,
      balanceDeduct,
      balanceAfter,
      cashPaid: Math.round((paidAmount - balanceDeduct) * 100) / 100,
      enrollment: { ...(rowToEnrollment(db.prepare('SELECT * FROM enrollments WHERE id=?').get(id))), id },
    }
  })
  return tx()
}

// 更新报名：续费/补赠课/改价/改状态（课时为绝对值语义，差值即增量）
export async function updateEnrollment(enrollment) {
  validateStorageId(enrollment?.id, 'enrollment.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollment.id)
  if (!old) return { updated: false, notFound: true }
  const before = rowToEnrollment(old)

  const tx = db.transaction(() => {
    const newPurchased = Number(enrollment.purchasedHours ?? old.purchased_hours)
    const newGift = Number(enrollment.giftHours ?? old.gift_hours)
    const purchasedDelta = newPurchased - old.purchased_hours
    const giftDelta = newGift - old.gift_hours
    const newRemainingPaid = Math.max(0, old.remaining_paid_hours + purchasedDelta)
    const newRemainingGift = Math.max(0, old.remaining_gift_hours + giftDelta)
    const unitPrice = Number(enrollment.unitPrice ?? old.unit_price)
    const totalAmount = Number(enrollment.totalAmount ?? (newPurchased * unitPrice))
    const paidAmount = Number(enrollment.paidAmount ?? old.paid_amount)
    const status = enrollment.status || old.status
    db.prepare(`UPDATE enrollments SET
      purchased_hours=?, gift_hours=?, remaining_paid_hours=?, remaining_gift_hours=?,
      unit_price=?, total_amount=?, paid_amount=?, discount_amount=?,
      payment_method=?, payment_status=?, contract_no=?, expired_at=?, status=?, note=? WHERE id=?`).run(
      newPurchased, newGift, newRemainingPaid, newRemainingGift,
      unitPrice, totalAmount, paidAmount,
      Number(enrollment.discountAmount ?? old.discount_amount),
      enrollment.paymentMethod ?? old.payment_method,
      enrollment.paymentStatus ?? old.payment_status,
      enrollment.contractNo ?? old.contract_no,
      enrollment.expiredAt ?? old.expired_at,
      status,
      enrollment.note ?? old.note,
      enrollment.id,
    )
    return { purchasedDelta, giftDelta }
  })
  const r = tx()
  const after = rowToEnrollment(db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollment.id))
  return { updated: true, notFound: false, before, after, ...r }
}

export async function deleteEnrollment(id) {
  validateStorageId(id, 'enrollment.id')
  const db = getDb()
  const oldRow = db.prepare('SELECT * FROM enrollments WHERE id=?').get(id)
  const before = oldRow ? rowToEnrollment(oldRow) : null
  const info = db.prepare('DELETE FROM enrollments WHERE id=?').run(id)
  return { deleted: info.changes > 0, before }
}

// 学员报名汇总（供学员管理页展示总购课/总剩余）
export async function getEnrollmentSummaryByStudent(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const rows = db.prepare(`SELECT
      COUNT(*) AS count,
      COALESCE(SUM(purchased_hours),0) AS purchased,
      COALESCE(SUM(gift_hours),0) AS gift,
      COALESCE(SUM(remaining_paid_hours),0) AS remainingPaid,
      COALESCE(SUM(remaining_gift_hours),0) AS remainingGift,
      COALESCE(SUM(total_amount),0) AS totalAmount,
      COALESCE(SUM(paid_amount),0) AS paidAmount
    FROM enrollments WHERE student_id=? AND status='active'`).get(studentId)
  return {
    count: rows?.count || 0,
    purchasedHours: rows?.purchased || 0,
    giftHours: rows?.gift || 0,
    remainingHours: (rows?.remainingPaid || 0) + (rows?.remainingGift || 0),
    remainingPaidHours: rows?.remainingPaid || 0,
    remainingGiftHours: rows?.remainingGift || 0,
    totalAmount: rows?.totalAmount || 0,
    paidAmount: rows?.paidAmount || 0,
  }
}

// 批量查询多学员报名汇总（一次查询，避免 N+1）
export async function getEnrollmentSummaries(studentIds) {
  if (!studentIds || studentIds.length === 0) return {}
  const db = getDb()
  const placeholders = studentIds.map(() => '?').join(',')
  const rows = db.prepare(`SELECT student_id,
      COUNT(*) AS count,
      COALESCE(SUM(purchased_hours),0) AS purchased,
      COALESCE(SUM(gift_hours),0) AS gift,
      COALESCE(SUM(remaining_paid_hours),0) AS remainingPaid,
      COALESCE(SUM(remaining_gift_hours),0) AS remainingGift,
      COALESCE(SUM(total_amount),0) AS totalAmount,
      COALESCE(SUM(paid_amount),0) AS paidAmount
    FROM enrollments WHERE student_id IN (${placeholders}) AND status='active'
    GROUP BY student_id`).all(...studentIds)
  const map = {}
  for (const r of rows) {
    map[r.student_id] = {
      count: r.count,
      purchasedHours: r.purchased,
      giftHours: r.gift,
      remainingHours: r.remainingPaid + r.remainingGift,
      remainingPaidHours: r.remainingPaid,
      remainingGiftHours: r.remainingGift,
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
    }
  }
  return map
}

// ========== 课时有效期处理 ==========
// 扫描已过期且仍 active 的报名记录，置为 expired 状态
// 返回 { affected }
export function expireOverdueEnrollments() {
  const db = getDb()
  const todayStr = today()
  const info = db.prepare(
    `UPDATE enrollments
       SET status='expired'
     WHERE status='active'
       AND expired_at <> ''
       AND expired_at < ?`,
  ).run(todayStr)
  return { affected: info.changes || 0 }
}
