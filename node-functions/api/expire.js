// 课时过期处理 API（已废弃）
// POST /api/expire
// 报名不再设置有效期，过期课时须手动走退课流程
import { json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'enrollments:update')
  if (authFail) return authFail

  return json({
    code: 0,
    message: '报名不再设置有效期，过期课时请手动走退课流程',
    data: { affected: 0 },
  })
}
