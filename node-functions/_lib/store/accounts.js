import { getDb, validateStorageId } from './core.js'
import { genAccountTxId } from '../id.js'
import { now } from '../time.js'

// ========== 学员账户（balance + 流水） ==========
// balance 挂在 students 表；account_transactions 记录所有余额变动流水。
// type 取值：
//   recharge      充值（增加余额）
//   refund        退课转入（增加余额）
//   enroll_deduct 报名抵扣（减少余额）
//   withdraw      提现/退款出账（减少余额）
// amount 一律为正数，方向由 type 决定（recharge/refund 为入账，enroll_deduct/withdraw 为出账）。

function rowToTx(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    type: r.type,
    amount: typeof r.amount === 'number' ? r.amount : Number(r.amount || 0),
    balanceAfter: typeof r.balance_after === 'number' ? r.balance_after : Number(r.balance_after || 0),
    refType: r.ref_type || '',
    refId: r.ref_id || '',
    operatorId: r.operator_id || '',
    note: r.note || '',
    createdAt: r.created_at || '',
  }
}

// 底层：在同一事务内调整学员余额并写流水（供退课/报名抵扣/充值/提现复用）
// direction: 'in'（入账，增加余额） / 'out'（出账，减少余额）
// 必须在调用方的事务中执行；调用方需保证 db 事务包裹。
export function adjustBalanceTx(db, { studentId, type, amount, direction, refType = '', refId = '', operatorId = '', note = '' }) {
  if (!studentId) throw new Error('adjustBalanceTx 缺少 studentId')
  if (!['in', 'out'].includes(direction)) throw new Error('adjustBalanceTx direction 仅允许 in/out')
  const amt = Number(amount || 0)
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('adjustBalanceTx amount 需为正数')
  const stu = db.prepare('SELECT balance FROM students WHERE id=?').get(studentId)
  if (!stu) throw new Error('学员不存在')
  const cur = Number(stu.balance || 0)
  const next = direction === 'in' ? cur + amt : cur - amt
  // 浮点规整到 2 位，避免误差
  const rounded = Math.round(next * 100) / 100
  if (direction === 'out' && rounded < 0) {
    throw new Error(`学员账户余额不足（当前 ${cur}，需扣除 ${amt}）`)
  }
  db.prepare('UPDATE students SET balance=? WHERE id=?').run(rounded, studentId)
  const id = genAccountTxId()
  db.prepare(`INSERT INTO account_transactions
    (id, student_id, type, amount, balance_after, ref_type, ref_id, operator_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, studentId, type, amt, rounded, refType, refId, operatorId, note, now(),
  )
  return { id, balanceAfter: rounded }
}

// 充值（独立事务）
export async function rechargeAccount({ studentId, amount, operatorId = '', note = '' }) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const tx = db.transaction(() => adjustBalanceTx(db, {
    studentId, type: 'recharge', amount, direction: 'in', refType: 'recharge', operatorId, note,
  }))
  const r = tx()
  return { ...r, type: 'recharge', amount: Number(amount) }
}

// 提现/退款出账（独立事务）
export async function withdrawAccount({ studentId, amount, operatorId = '', note = '' }) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const tx = db.transaction(() => adjustBalanceTx(db, {
    studentId, type: 'withdraw', amount, direction: 'out', refType: 'withdraw', operatorId, note,
  }))
  const r = tx()
  return { ...r, type: 'withdraw', amount: Number(amount) }
}

// 查询学员账户流水（按时间倒序）
export async function getAccountTransactions({ studentId } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM account_transactions WHERE 1=1'
  const params = []
  if (studentId) { sql += ' AND student_id=?'; params.push(studentId) }
  sql += ' ORDER BY datetime(created_at) DESC, id DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToTx)
}
