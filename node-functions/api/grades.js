// 年级列表 API
// GET /api/grades
// 返回全部年级（按 sort_order 排序），后台管理用，需鉴权
import { getGrades, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export default async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'grades:view')
  if (authFail) return authFail

  try {
    const grades = await getGrades()
    return json({
      code: 0,
      message: 'ok',
      data: { grades },
    })
  } catch (e) {
    console.error('[grades] 查询异常:', e?.message || String(e))
    return json(
      { code: 1, message: '查询失败，请稍后重试', data: null },
      500,
    )
  }
}
