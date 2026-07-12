// 新增账户 API（仅超管）
// POST /api/admin-add  body: { admin: { username, password, role, realName, phone } }
import { createAdmin, getAdminByUsername, json } from '../_lib/store.js'
import { requirePermission, hashPassword, validatePasswordPolicy } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  const fail = await requirePermission(context, 'admins:create')
  if (fail) return fail
  const { request } = context
  const { admin } = await readBody(request)
  if (!admin) return json({ code: 1, message: '请求体需包含 admin 字段', data: null }, 400)

  const username = String(admin.username || '').trim()
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
    return json({ code: 1, message: '用户名需为 3-32 位字母/数字/下划线', data: null }, 400)
  }
  const pwdErr = validatePasswordPolicy(admin.password)
  if (pwdErr) {
    return json({ code: 1, message: pwdErr, data: null }, 400)
  }
  const realName = String(admin.realName || '').trim()
  if (!realName) {
    return json({ code: 1, message: '姓名为必填项', data: null }, 400)
  }
  const role = ['admin', 'teacher'].includes(admin.role) ? admin.role : 'admin'
  if (await getAdminByUsername(username)) {
    return json({ code: 1, message: '用户名已存在', data: null }, 409)
  }

  try {
    const passwordHash = await hashPassword(String(admin.password))
    // permissions：字符串数组，仅对非超管生效；superadmin 忽略
    const permissions = Array.isArray(admin.permissions)
      ? admin.permissions.filter((p) => typeof p === 'string' && p.trim())
      : []
    const created = await createAdmin({
      username, passwordHash, role,
      realName,
      phone: String(admin.phone || '').trim(),
      createdBy: context.admin.id,
      permissions,
    })
    await writeAudit(context, {
      action: 'create', module: 'admins',
      targetType: 'admin', targetId: created.id, targetName: username,
      summary: `创建${role === 'teacher' ? '教师' : '管理员'}账号 ${username}`,
    })
    return json({ code: 0, message: '账号已创建', data: { admin: created } })
  } catch (e) {
    console.error('[admin-add] 异常:', e?.message || String(e))
    return json({ code: 1, message: '创建失败，请稍后重试', data: null }, 500)
  }
}
