// 权限定义查询 API
// GET /api/permission-definitions  返回权限矩阵定义（供前端渲染权限分配表）
import { PERMISSION_DEFINITIONS, ROLE_PERMISSIONS, requirePermission } from '../_lib/auth.js'
import { json } from '../_lib/store.js'

export async function onRequestGet(context) {
  // 仅超管可查看权限定义（权限分配是超管专属能力）
  const fail = await requirePermission(context, 'admins:view')
  if (fail) return fail
  return json({
    code: 0,
    message: 'ok',
    data: {
      definitions: PERMISSION_DEFINITIONS,
      rolePermissions: ROLE_PERMISSIONS,
    },
  })
}
