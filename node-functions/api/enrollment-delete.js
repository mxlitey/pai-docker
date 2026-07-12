// 删除报名 API
// DELETE /api/enrollment-delete  body: { id }
// 业务约束：报名记录不可物理删除（保留财务数据完整性），只能走退课流程
// （通过 enrollment-update 将状态改为 settled）
import { json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestDelete(context) {
  const authFail = await requirePermission(context, 'enrollments:delete')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { id } = body

  if (!id) {
    return json({ code: 1, message: '缺少 id', data: null }, 400)
  }

  // 报名记录不可删除，只能走退课流程
  return json({
    code: 1,
    message: '报名记录不可删除，请走退课流程（将状态改为「已结转」）',
    data: null,
  }, 400)
}
