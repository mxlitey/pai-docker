// 批量报名 API
// POST /api/enrollment-batch  body: { courseId, items: [{ studentId, purchasedHours, giftHours, unitPrice, paidAmount }] }
import { batchAddEnrollments, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'enrollments:create')
  if (authFail) return authFail

  const { request } = context
  const body = await readBody(request)
  const { courseId, items } = body

  if (!courseId) {
    return json({ code: 1, message: '缺少 courseId', data: null }, 400)
  }
  if (!Array.isArray(items) || items.length === 0) {
    return json({ code: 1, message: '报名条目不能为空', data: null }, 400)
  }

  // 基础校验每条
  for (const it of items) {
    if (!it.studentId) {
      return json({ code: 1, message: '存在缺少 studentId 的条目', data: null }, 400)
    }
    const ph = Number(it.purchasedHours)
    if (!Number.isFinite(ph) || ph < 0 || !Number.isInteger(ph)) {
      return json({ code: 1, message: `学员 ${it.studentId} 的购课课时需为非负整数`, data: null }, 400)
    }
  }

  try {
    const operatorId = context.admin?.id || ''
    const result = await batchAddEnrollments(courseId, items, operatorId)
    await writeAudit(context, {
      action: 'create',
      module: 'enrollments',
      targetType: 'enrollment',
      targetId: courseId,
      targetName: `批量报名 ${result.count} 条`,
      summary: `为课程 ${courseId} 批量新增 ${result.count} 条报名`,
      after: { courseId, count: result.count, results: result.results },
    })
    return json({
      code: 0,
      message: `已批量新增 ${result.count} 条报名`,
      data: result,
    })
  } catch (e) {
    console.error('[enrollment-batch] 异常:', e?.message || String(e))
    return json({ code: 1, message: '批量报名失败，请稍后重试', data: null }, 500)
  }
}
