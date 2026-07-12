import { getDb } from './core.js'
import { genAuditId } from '../id.js'
import { now } from '../time.js'

// ========== 行 <-> 对象 映射 ==========
function rowToAuditLog(r) {
  if (!r) return null
  return {
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    action: r.action,
    module: r.module,
    targetType: r.target_type || '',
    targetId: r.target_id || '',
    targetName: r.target_name || '',
    summary: r.summary || '',
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    ip: r.ip || '',
    userAgent: r.user_agent || '',
    createdAt: r.created_at || '',
  }
}

// ========== 审计日志 ==========
// 写入一条审计记录（before/after 为对象，内部 JSON 序列化）
export async function addAuditLog({
  actorId, actorName, actorRole, action, module,
  targetType = '', targetId = '', targetName = '', summary = '',
  before = null, after = null, ip = '', userAgent = '',
}) {
  const db = getDb()
  const id = genAuditId()
  db.prepare(`INSERT INTO audit_logs
    (id, actor_id, actor_name, actor_role, action, module, target_type, target_id, target_name, summary, before_json, after_json, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, actorId || '', actorName || '', actorRole || '',
    action, module, targetType, targetId, targetName, summary,
    before ? JSON.stringify(before) : '',
    after ? JSON.stringify(after) : '',
    ip, userAgent,
    now(),
  )
  return id
}

// 查询审计日志（分页 + 多条件过滤）
export async function getAuditLogs({
  actorId, module, targetType, targetId, action,
  startDate, endDate, page = 1, pageSize = 20,
} = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM audit_logs WHERE 1=1'
  const params = []
  if (actorId) { sql += ' AND actor_id=?'; params.push(actorId) }
  if (module) { sql += ' AND module=?'; params.push(module) }
  if (targetType) { sql += ' AND target_type=?'; params.push(targetType) }
  if (targetId) { sql += ' AND target_id=?'; params.push(targetId) }
  if (action) { sql += ' AND action=?'; params.push(action) }
  if (startDate) { sql += ' AND created_at>=?'; params.push(startDate) }
  if (endDate) { sql += ' AND created_at<=?'; params.push(endDate + ' 23:59:59') }
  // 计数：审计日志只增不删，用 max(rowid) 作近似总数，避免全表 COUNT(*)
  // 有过滤条件时回退到精确 COUNT（过滤后行数通常不大）
  let total
  if (actorId || module || targetType || targetId || action || startDate || endDate) {
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) AS c')
    total = db.prepare(countSql).get(...params)?.c || 0
  } else {
    total = db.prepare('SELECT MAX(rowid) AS c FROM audit_logs').get()?.c || 0
  }
  // 分页：created_at 已是 'YYYY-MM-DD HH:MM:SS' 字典序可比较，直接 ORDER BY 可命中 idx_audit_created
  sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
  const rows = db.prepare(sql).all(...params, pageSize, (page - 1) * pageSize)
  return { logs: rows.map(rowToAuditLog), total, page, pageSize }
}
