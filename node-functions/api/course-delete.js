// 删除课程 API
// DELETE /api/course-delete  body: { courseId }
// 同时删除该课程的所有关联排课记录
import { deleteCourseWithSchedules, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestDelete(context) {
  const authFail = await requirePermission(context, 'courses:delete')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { courseId } = body

  if (!courseId) {
    return json(
      { code: 1, message: '请求体需包含 courseId 字段', data: null },
      400,
    )
  }

  try {
    const result = await deleteCourseWithSchedules(courseId)
    if (result.blocked) {
      return json({ code: 1, message: result.message, data: null }, 400)
    }
    if (!result.courseRemoved) {
      return json(
        { code: 1, message: `课程 id="${courseId}" 不存在`, data: null },
        404,
      )
    }
    const before = result.before || null
    const courseName = before?.name || courseId
    await writeAudit(context, {
      action: 'delete',
      module: 'courses',
      targetType: 'course',
      targetId: courseId,
      targetName: courseName,
      summary: `删除课程「${courseName}」` + (result.deletedScheduleCount > 0 ? `（同时删除 ${result.deletedScheduleCount} 条排课）` : ''),
      before,
    })
    return json({
      code: 0,
      message: '课程已删除',
      data: result,
    })
  } catch (e) {
    console.error('[course-delete] 删除异常:', e?.message || String(e))
    return json(
      { code: 1, message: '删除失败，请稍后重试', data: null },
      500,
    )
  }
}
