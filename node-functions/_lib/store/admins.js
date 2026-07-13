import { getDb } from './core.js'
import { genAdminId } from '../id.js'
import { now } from '../time.js'

// ========== 行 <-> 对象 映射 ==========
function rowToAdmin(r) {
  if (!r) return null
  return {
    id: r.id,
    username: r.username,
    role: r.role || 'admin',
    realName: r.real_name || '',
    phone: r.phone || '',
    status: r.status || 'active',
    // permissions 存为逗号分隔串，空串表示用角色默认权限
    permissions: r.permissions || '',
    lastLoginAt: r.last_login_at || '',
    // lastLoginIp 不在列表接口返回，避免 PII（IP）暴露给普通管理员；仅审计日志记录
    createdAt: r.created_at || '',
    createdBy: r.created_by || '',
    // password_hash 不返回给前端
  }
}

// ========== 管理员账号（RBAC） ==========
export async function getAdmins() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM admins ORDER BY created_at, id').all()
  return rows.map(rowToAdmin)
}

export async function getAdminById(id) {
  const db = getDb()
  return rowToAdmin(db.prepare('SELECT * FROM admins WHERE id=?').get(id))
}

export async function getAdminByUsername(username) {
  const db = getDb()
  return db.prepare('SELECT * FROM admins WHERE username=?').get(username) || null
}

export async function countAdmins() {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS c FROM admins').get()
  return row?.c || 0
}

export async function countSuperAdmins() {
  const db = getDb()
  const row = db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role='superadmin' AND status='active'").get()
  return row?.c || 0
}

// 创建超管（bootstrap 用，固定 role=superadmin）
export async function createSuperAdmin(username, passwordHash) {
  const db = getDb()
  const id = genAdminId()
  db.prepare(`INSERT INTO admins (id, username, password_hash, role) VALUES (?, ?, ?, 'superadmin')`).run(id, username, passwordHash)
  return { id, username, role: 'superadmin' }
}

// 创建管理员（超管用，可选 role）
export async function createAdmin({ username, passwordHash, role, realName, phone, createdBy, permissions }) {
  const db = getDb()
  const id = genAdminId()
  // permissions 数组 → 逗号分隔串存储
  const permStr = Array.isArray(permissions) ? permissions.filter(Boolean).join(',') : ''
  db.prepare(`INSERT INTO admins (id, username, password_hash, role, real_name, phone, created_by, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, username, passwordHash, role || 'admin', realName || '', phone || '', createdBy || '', permStr,
  )
  return rowToAdmin(db.prepare('SELECT * FROM admins WHERE id=?').get(id))
}

export async function updateAdmin({ id, role, realName, phone, status, passwordHash, permissions }) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM admins WHERE id=?').get(id)
  if (!old) return { updated: false, notFound: true }
  const sets = []
  const params = []
  if (role !== undefined) { sets.push('role=?'); params.push(role) }
  if (realName !== undefined) { sets.push('real_name=?'); params.push(realName) }
  if (phone !== undefined) { sets.push('phone=?'); params.push(phone) }
  if (status !== undefined) { sets.push('status=?'); params.push(status) }
  if (passwordHash) { sets.push('password_hash=?'); params.push(passwordHash) }
  if (permissions !== undefined) {
    const permStr = Array.isArray(permissions) ? permissions.filter(Boolean).join(',') : String(permissions || '')
    sets.push('permissions=?'); params.push(permStr)
  }
  if (sets.length > 0) {
    params.push(id)
    db.prepare(`UPDATE admins SET ${sets.join(', ')} WHERE id=?`).run(...params)
  }
  return { updated: true, notFound: false }
}

export async function deleteAdmin(id) {
  const db = getDb()
  const info = db.prepare('DELETE FROM admins WHERE id=?').run(id)
  return { deleted: info.changes > 0 }
}

// 记录登录时间/IP
export async function recordLogin(id, ip) {
  const db = getDb()
  db.prepare('UPDATE admins SET last_login_at=?, last_login_ip=? WHERE id=?')
    .run(now(), ip || '', id)
}

// 兼容旧调用：返回首个超管
export async function getSuperAdmin() {
  const db = getDb()
  const row = db.prepare("SELECT * FROM admins WHERE role='superadmin' LIMIT 1").get()
  return row || null
}
