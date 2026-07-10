// 排课删除 API
// DELETE /api/schedule  body: { id, studentId, date }
import { deleteSchedule, getScheduleById, json } from '../_lib/store.js'
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
    // 状态校验：已到课/缺勤/已取消的排课不允许删除
    const current = await getScheduleById(id)
    if (!current) {
      return json({ code: 1, message: '排课记录不存在', data: null }, 404)
    }
    if (current.status === 'cancelled') {
      return json({ code: 1, message: '已取消的排课不允许删除', data: null }, 409)
    }
    if (current.attended === true) {
      return json({ code: 1, message: '已到课的排课不允许删除', data: null }, 409)
    }
    if (current.attended === false) {
      return json({ code: 1, message: '已缺勤的排课不允许删除', data: null }, 409)
    }

    const result = await deleteSchedule(id, studentId, date)
    if (result.count > 0) {
      const before = result.before || null
      const studentName = before?.studentName || studentId
      const courseName = before?.courseName || ''
      await writeAudit(context, {
        action: 'delete',
        module: 'schedules',
        targetType: 'schedule',
        targetId: id,
        targetName: [studentName, courseName].filter(Boolean).join(' '),
        summary: `删除排课「${[studentName, courseName].filter(Boolean).join(' ')}」 ${date}`,
        before,
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
