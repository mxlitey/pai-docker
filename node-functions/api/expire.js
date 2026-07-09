// 课时过期处理 API
// POST /api/expire  扫描已过期的报名记录并置为 expired
// 可由后台手动触发，也可由定时任务调用（不经过 HTTP）
import { expireOverdueEnrollments, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'enrollments:update')
  if (authFail) return authFail

  try {
    const result = expireOverdueEnrollments()
    if (result.affected > 0) {
      await writeAudit(context, {
        action: 'expire',
        module: 'enrollments',
        targetType: 'enrollment',
        targetId: '',
        targetName: '课时过期处理',
        summary: `课时过期处理：${result.affected} 条报名记录置为 expired`,
        after: result,
      })
    }
    return json({
      code: 0,
      message: result.affected > 0 ? `已处理 ${result.affected} 条过期记录` : '暂无过期记录',
      data: result,
    })
  } catch (e) {
    return json({ code: 1, message: e.message || '处理失败', data: null }, 500)
  }
}
