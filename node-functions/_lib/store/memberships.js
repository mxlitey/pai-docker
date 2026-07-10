import { getDb } from './core.js'
import { genMembershipId, genStudentMembershipId } from '../id.js'

// ========== 会员卡 memberships ==========
export async function getMemberships({ status } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM memberships WHERE 1=1'
  const params = []
  if (status) { sql += ' AND status=?'; params.push(status) }
  sql += ' ORDER BY created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, name: r.name, type: r.type, durationDays: r.duration_days,
    price: r.price, status: r.status, benefits: r.benefits,
    remark: r.remark, createdAt: r.created_at,
  }))
}

export async function addMembership(m) {
  const db = getDb()
  const id = genMembershipId()
  db.prepare(`INSERT INTO memberships (id, name, type, duration_days, price, status, benefits, remark) VALUES (?,?,?,?,?,?,?,?)`).run(
    id, m.name || '', m.type || 'monthly', Math.max(1, Math.floor(Number(m.durationDays) || 30)),
    Math.max(0, Number(m.price) || 0), m.status || 'active', m.benefits || '', m.remark || '',
  )
  return { id, membership: { ...m, id } }
}

export async function updateMembership(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM memberships WHERE id=?').get(id)
  if (!old) throw new Error('会员卡不存在')
  db.prepare(`UPDATE memberships SET name=?, type=?, duration_days=?, price=?, status=?, benefits=?, remark=? WHERE id=?`).run(
    patch.name !== undefined ? patch.name : old.name,
    patch.type !== undefined ? patch.type : old.type,
    patch.durationDays !== undefined ? Math.max(1, Math.floor(Number(patch.durationDays) || 30)) : old.duration_days,
    patch.price !== undefined ? Math.max(0, Number(patch.price) || 0) : old.price,
    patch.status !== undefined ? patch.status : old.status,
    patch.benefits !== undefined ? patch.benefits : old.benefits,
    patch.remark !== undefined ? patch.remark : old.remark,
    id,
  )
  return { id }
}

export async function deleteMembership(id) {
  const db = getDb()
  db.prepare('DELETE FROM memberships WHERE id=?').run(id)
  return { ok: true }
}

// 学员会员卡
export async function getStudentMemberships({ studentId, status } = {}) {
  const db = getDb()
  let sql = `SELECT sm.*, m.name AS membership_name, m.type AS membership_type, m.duration_days,
             s.name AS student_name
             FROM student_memberships sm
             LEFT JOIN memberships m ON m.id=sm.membership_id
             LEFT JOIN students s ON s.id=sm.student_id WHERE 1=1`
  const params = []
  if (studentId) { sql += ' AND sm.student_id=?'; params.push(studentId) }
  if (status) { sql += ' AND sm.status=?'; params.push(status) }
  sql += ' ORDER BY sm.created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, studentId: r.student_id, studentName: r.student_name,
    membershipId: r.membership_id, membershipName: r.membership_name,
    membershipType: r.membership_type, status: r.status,
    startedAt: r.started_at, expiredAt: r.expired_at,
    paidAmount: r.paid_amount, createdAt: r.created_at,
  }))
}

export async function addStudentMembership(sm) {
  const db = getDb()
  const id = genStudentMembershipId()
  const startedAt = sm.startedAt || new Date().toISOString().slice(0, 10)
  // 计算到期日
  let expiredAt = sm.expiredAt || ''
  if (!expiredAt && sm.durationDays) {
    const d = new Date(startedAt)
    d.setDate(d.getDate() + Math.max(1, Math.floor(Number(sm.durationDays) || 30)))
    expiredAt = d.toISOString().slice(0, 10)
  }
  db.prepare(`INSERT INTO student_memberships (id, student_id, membership_id, status, started_at, expired_at, paid_amount, operator_id) VALUES (?,?,?,?,?,?,?,?)`).run(
    id, sm.studentId, sm.membershipId, sm.status || 'active', startedAt, expiredAt,
    Math.max(0, Number(sm.paidAmount) || 0), sm.operatorId || '',
  )
  return { id }
}

export async function deleteStudentMembership(id) {
  const db = getDb()
  db.prepare('DELETE FROM student_memberships WHERE id=?').run(id)
  return { ok: true }
}
