// 删除管理员 API（仅超管）
// DELETE /api/admin-delete  body: { id }
// 约束：不可删除自己；不可删除最后一个超管
import { deleteAdmin, getAdminById, countSuperAdmins, json } from '../_lib/store.js'
import { requirePermission, invalidateAdminCache } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestDelete(context) {
  const fail = await requirePermission(context, 'admins:delete')
  if (fail) return fail
  const { request } = context
  const { id } = await readBody(request)
  if (!id) return json({ code: 1, message: '缺少 id', data: null }, 400)

  const target = await getAdminById(id)
  if (!target) return json({ code: 1, message: '账号不存在', data: null }, 404)

  if (id === context.admin.id) {
    return json({ code: 1, message: '不可删除自己的账号', data: null }, 400)
  }
  if (target.role === 'superadmin' && (await countSuperAdmins()) <= 1) {
    return json({ code: 1, message: '系统至少保留一个超管，不可删除最后一个超管', data: null }, 400)
  }

  try {
    await deleteAdmin(id)
    await writeAudit(context, {
      action: 'delete', module: 'admins',
      targetType: 'admin', targetId: id, targetName: target.username,
      summary: `删除账号 ${target.username}（${target.role}）`,
    })
    // 失效该账号的权限缓存
    invalidateAdminCache(id)
    return json({ code: 0, message: '账号已删除', data: null })
  } catch (e) {
    console.error('[admin-delete] 异常:', e?.message || String(e))
    return json({ code: 1, message: '删除失败，请稍后重试', data: null }, 500)
  }
}
