import { getDb } from './core.js'
import { genLeadId, genFollowupId } from '../id.js'
import { now } from '../time.js'

// ========== CRM 线索 leads ==========
export async function getLeads({ stage, assignedTo } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM leads WHERE 1=1'
  const params = []
  if (stage) { sql += ' AND stage=?'; params.push(stage) }
  if (assignedTo) { sql += ' AND assigned_to=?'; params.push(assignedTo) }
  sql += ' ORDER BY updated_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, name: r.name, phone: r.phone, grade: r.grade, source: r.source,
    stage: r.stage, intention: r.intention, assignedTo: r.assigned_to,
    remark: r.remark, converted: !!r.converted, studentId: r.student_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }))
}

export async function addLead(lead) {
  const db = getDb()
  const id = genLeadId()
  const nowStr = now()
  db.prepare(`INSERT INTO leads (id, name, phone, grade, source, stage, intention, assigned_to, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, lead.name || '', lead.phone || '', lead.grade || '', lead.source || '',
    lead.stage || 'new', lead.intention || '', lead.assignedTo || '', lead.remark || '', nowStr, nowStr,
  )
  return { id, lead: { ...lead, id } }
}

export async function updateLead(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM leads WHERE id=?').get(id)
  if (!old) throw new Error('线索不存在')
  const nowStr = now()
  db.prepare(`UPDATE leads SET name=?, phone=?, grade=?, source=?, stage=?, intention=?, assigned_to=?, remark=?, converted=?, student_id=?, updated_at=? WHERE id=?`).run(
    patch.name !== undefined ? patch.name : old.name,
    patch.phone !== undefined ? patch.phone : old.phone,
    patch.grade !== undefined ? patch.grade : old.grade,
    patch.source !== undefined ? patch.source : old.source,
    patch.stage !== undefined ? patch.stage : old.stage,
    patch.intention !== undefined ? patch.intention : old.intention,
    patch.assignedTo !== undefined ? patch.assignedTo : old.assigned_to,
    patch.remark !== undefined ? patch.remark : old.remark,
    patch.converted !== undefined ? (patch.converted ? 1 : 0) : old.converted,
    patch.studentId !== undefined ? patch.studentId : old.student_id,
    nowStr, id,
  )
  return { id }
}

export async function deleteLead(id) {
  const db = getDb()
  db.prepare('DELETE FROM leads WHERE id=?').run(id)
  db.prepare('DELETE FROM lead_followups WHERE lead_id=?').run(id)
  return { ok: true }
}

// 线索跟进记录
export async function getFollowups(leadId) {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM lead_followups WHERE lead_id=? ORDER BY created_at DESC').all(leadId)
  return rows.map((r) => ({
    id: r.id, leadId: r.lead_id, content: r.content, stage: r.stage,
    operatorId: r.operator_id, createdAt: r.created_at,
  }))
}

export async function addFollowup(fu) {
  const db = getDb()
  const id = genFollowupId()
  db.prepare(`INSERT INTO lead_followups (id, lead_id, content, stage, operator_id) VALUES (?,?,?,?,?)`).run(
    id, fu.leadId, fu.content || '', fu.stage || '', fu.operatorId || '',
  )
  // 同步更新线索的 updated_at
  db.prepare('UPDATE leads SET updated_at=? WHERE id=?').run(now(), fu.leadId)
  return { id }
}
