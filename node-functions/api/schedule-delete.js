// 排课删除 API
// DELETE /api/schedule  body: { id, studentId, date }
import { deleteSchedule, getStudentById, json } from '../_lib/store.js'
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
  const authFail = await requirePermission(context, 'schedules:delete')
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

  // 格式校验，防止路径遍历与脏数据
  if (typeof studentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(studentId)) {
    return json({ code: 1, message: 'studentId 格式不正确', data: null }, 400)
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ code: 1, message: 'date 格式应为 yyyy-MM-dd', data: null }, 400)
  }

  try {
    // 删除前尝试获取学员名，用于审计
    let studentName = ''
    try {
      const s = await getStudentById(studentId)
      studentName = s?.name || ''
    } catch {}
    const result = await deleteSchedule(id, studentId, date)
    if (result.count > 0) {
      await writeAudit(context, {
        action: 'delete',
        module: 'schedules',
        targetType: 'schedule',
        targetId: id,
        targetName: studentName,
        summary: `删除排课 ${studentName} ${date}`,
      })
    }
    return json({
      code: 0,
      message: result.count > 0 ? '排课已删除' : '未找到对应排课',
      data: result,
    })
  } catch (e) {
    console.error('[schedule-delete] 删除异常:', e?.message || String(e))
    return json({ code: 1, message: '删除失败，请稍后重试', data: null }, 500)
  }
}
