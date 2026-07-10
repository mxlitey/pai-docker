// 调课历史查询 API
// GET /api/schedule-changes?scheduleId=xxx 或 ?studentId=xxx&limit=50
// 返回调课记录列表（按时间倒序），支持按排课ID（原或新）或学员ID查询
import { getScheduleChanges, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

export default async function onRequestGet(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const url = new URL(request.url)
  const scheduleId = url.searchParams.get('scheduleId') || ''
  const studentId = url.searchParams.get('studentId') || ''
  const limit = Number(url.searchParams.get('limit')) || 0

  if (!scheduleId && !studentId) {
    return json({ code: 1, message: '需提供 scheduleId 或 studentId 参数', data: null }, 400)
  }

  try {
    const changes = await getScheduleChanges({
      scheduleId: scheduleId || undefined,
      studentId: studentId || undefined,
      limit: limit > 0 ? limit : undefined,
    })
    return json({ code: 0, message: 'ok', data: { changes, total: changes.length } })
  } catch (e) {
    console.error('[schedule-changes] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}
