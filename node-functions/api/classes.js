// 班级列表 API
// GET /api/classes?courseId=&status=
// 返回全部班级（带成员数 + 关联课程名），需鉴权
import { getClasses, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export default async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'classes:view')
  if (authFail) return authFail

  const { request } = context
  const url = new URL(request.url)
  const courseId = url.searchParams.get('courseId') || ''
  const status = url.searchParams.get('status') || ''

  try {
    const classes = await getClasses({ courseId: courseId || undefined, status: status || undefined })
    return json({ code: 0, message: 'ok', data: { classes } })
  } catch (e) {
    console.error('[classes] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}
