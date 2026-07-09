// 更新管理员 API（仅超管）
// PUT /api/admin-update  body: { admin: { id, role?, realName?, phone?, status?, password? } }
// 约束：不可降级/删除最后一个超管；不可禁用自己
import { updateAdmin, getAdminById, countSuperAdmins, json } from '../_lib/store.js'
import { requirePermission, hashPassword } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPut(context) {
  const fail = await requirePermission(context, 'admins:update')
  if (fail) return fail
  const { request } = context
  const { admin } = await readBody(request)
  if (!admin || !admin.id) {
    return json({ code: 1, message: '缺少 admin.id', data: null }, 400)
  }

  const target = await getAdminById(admin.id)
  if (!target) return json({ code: 1, message: '账号不存在', data: null }, 404)

  // 角色变更约束：最后一个超管不可降级
  if (admin.role && admin.role !== target.role) {
    if (target.role === 'superadmin' && admin.role !== 'superadmin') {
      if (await countSuperAdmins() <= 1) {
        return json({ code: 1, message: '系统至少保留一个超管，不可降级最后一个超管', data: null }, 400)
      }
    }
    if (!['superadmin', 'admin', 'teacher'].includes(admin.role)) {
      return json({ code: 1, message: '角色非法', data: null }, 400)
    }
  }

  // 禁用约束：不可禁用自己；不可禁用最后一个活跃超管（否则系统锁死）
  if (admin.status === 'disabled') {
    if (admin.id === context.admin.id) {
      return json({ code: 1, message: '不可禁用自己的账号', data: null }, 400)
    }
    if (target.role === 'superadmin' && target.status === 'active') {
      if (await countSuperAdmins() <= 1) {
        return json({ code: 1, message: '系统至少保留一个活跃超管，不可禁用最后一个超管', data: null }, 400)
      }
    }
  }

  let passwordHash = null
  if (admin.password) {
    if (String(admin.password).length < 6) {
      return json({ code: 1, message: '密码至少 6 位', data: null }, 400)
    }
    passwordHash = await hashPassword(String(admin.password))
  }

  try {
    // permissions：字符串数组；显式传入时覆盖（含空数组=清空自定义权限，回退角色默认）
    // undefined 表示不修改 permissions
    let permissions = undefined
    if (Array.isArray(admin.permissions)) {
      permissions = admin.permissions.filter((p) => typeof p === 'string' && p.trim())
    } else if (typeof admin.permissions === 'string') {
      // 支持 "useDefault" 哨兵值表示回退默认权限
      permissions = admin.permissions === '' ? [] : admin.permissions.split(',').map((s) => s.trim()).filter(Boolean)
    }
    await updateAdmin({
      id: admin.id,
      role: admin.role,
      realName: admin.realName,
      phone: admin.phone,
      status: admin.status,
      passwordHash,
      permissions,
    })
    const parts = []
    if (admin.role && admin.role !== target.role) parts.push(`角色→${admin.role}`)
    if (admin.status && admin.status !== target.status) parts.push(`状态→${admin.status}`)
    if (passwordHash) parts.push('重置密码')
    if (admin.realName !== undefined && admin.realName !== target.real_name) parts.push('改姓名')
    if (permissions !== undefined) parts.push('调整权限')
    await writeAudit(context, {
      action: 'update', module: 'admins',
      targetType: 'admin', targetId: admin.id, targetName: target.username,
      summary: `更新账号 ${target.username}${parts.length ? '（' + parts.join('、') + '）' : ''}`,
      before: { role: target.role, status: target.status, permissions: target.permissions },
    })
    return json({ code: 0, message: '账号已更新', data: null })
  } catch (e) {
    console.error('[admin-update] 异常:', e?.message || String(e))
    return json({ code: 1, message: '更新失败，请稍后重试', data: null }, 500)
  }
}
