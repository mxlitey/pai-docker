// 老师列表 API（供排课/班级表单下拉选择老师账号用）
// GET /api/teachers-list
// 返回 role='teacher' 且 status='active' 的精简列表（id + 名称）
// 需登录鉴权，但不需要 admins:view 权限（admin/teacher 都能调用）
import { getDb, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

export default async function onRequestGet(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const db = getDb()
  const rows = db.prepare(
    `SELECT id, username, real_name, phone
     FROM admins
     WHERE role='teacher' AND status='active'
     ORDER BY COALESCE(real_name, username), username`
  ).all()
  const teachers = rows.map((r) => ({
    id: r.id,
    username: r.username,
    realName: r.real_name || '',
    phone: r.phone || '',
  }))
  return json({ code: 0, message: 'ok', data: { teachers } })
}
