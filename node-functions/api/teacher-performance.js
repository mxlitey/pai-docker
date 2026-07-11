// 教师绩效 API
// GET /api/teacher-performance?startDate=&endDate= -> 按日期范围聚合教师排课/到课/评分，需 teachers:view
import { getTeacherPerformance, json } from '../_lib/store.js'
import { requireAuth, requirePermission } from '../_lib/auth.js'

export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const admin = context.admin

  const permFail = await requirePermission(context, 'teachers:view')
  if (permFail) return permFail

  if (request.method !== 'GET') {
    return json({ code: 1, message: '仅支持 GET 请求', data: null }, 405)
  }

  const url = new URL(request.url)
  const startDate = url.searchParams.get('startDate') || undefined
  const endDate = url.searchParams.get('endDate') || undefined

  try {
    const params = { startDate, endDate }
    // 教师角色仅查看自己的绩效
    if (admin.role === 'teacher') {
      params.teacher = admin.realName || admin.username
    }
    const rows = getTeacherPerformance(params)
    return json({ code: 0, data: rows })
  } catch (e) {
    console.error('[teacher-performance] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}
