// 排课删除 API
// DELETE /api/schedule  body: { id, studentId, date }
import { deleteSchedule, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestDelete(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { id, studentId, date } = body

  if (!id || !studentId || !date) {
    return json(
      { code: 1, message: '需提供 id、studentId、date 三个字段', data: null },
      400,
    )
  }

  try {
    const result = await deleteSchedule(id, studentId, date)
    return json({
      code: 0,
      message: result.count > 0 ? '排课已删除' : '未找到对应排课',
      data: result,
    })
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 500)
  }
}
