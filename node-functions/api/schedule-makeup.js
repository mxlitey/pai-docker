// 补课 API
// POST /api/schedule-makeup
// body: { scheduleId, newDate, newStartTime?, newEndTime?, reason? }
// 逻辑：保留原缺勤排课（不取消） → 生成新排课（设 makeup_for）
// 约束：原排课必须 attended===false（已缺勤）；已取消的排课不允许补课
import { getScheduleById, makeupSchedule, json } from '../_lib/store.js'
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
  const authFail = await requirePermission(context, 'schedules:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const {
    scheduleId, newDate, newStartTime, newEndTime, reason,
    newTeacher, newCourseId, newCourseName, newClassId, newLocation, newColor,
  } = body

  // 参数校验
  if (!scheduleId) {
    return json({ code: 1, message: '缺少 scheduleId', data: null }, 400)
  }
  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return json({ code: 1, message: 'newDate 格式应为 yyyy-MM-dd', data: null }, 400)
  }
  if (newStartTime && !/^\d{2}:\d{2}$/.test(newStartTime)) {
    return json({ code: 1, message: 'newStartTime 格式应为 HH:mm', data: null }, 400)
  }
  if (newEndTime && !/^\d{2}:\d{2}$/.test(newEndTime)) {
    return json({ code: 1, message: 'newEndTime 格式应为 HH:mm', data: null }, 400)
  }

  try {
    const original = await getScheduleById(scheduleId)
    if (!original) {
      return json({ code: 1, message: '排课记录不存在', data: null }, 404)
    }
    // 已取消的排课不允许补课
    if (original.status === 'cancelled') {
      return json({ code: 1, message: '已取消的排课不允许补课', data: null }, 409)
    }
    // 补课要求原排课已缺勤（attended===false）
    if (original.attended !== false) {
      return json(
        { code: 1, message: '补课仅针对缺勤排课，请先在点名管理中标记为缺勤', data: null },
        409,
      )
    }
    // 新日期/时间与原排课相同，且未改任何插班字段 → 无需补课
    const timeSame =
      original.date === newDate &&
      (newStartTime || original.startTime) === original.startTime &&
      (newEndTime || original.endTime) === original.endTime
    const insertChanged =
      (newTeacher !== undefined && newTeacher !== (original.teacher || '')) ||
      (newCourseId !== undefined && newCourseId !== (original.courseId || '')) ||
      (newCourseName !== undefined && newCourseName !== (original.courseName || '')) ||
      (newClassId !== undefined && newClassId !== (original.classId || '')) ||
      (newLocation !== undefined && newLocation !== (original.location || '')) ||
      (newColor !== undefined && newColor !== (original.color || ''))
    if (timeSame && !insertChanged) {
      return json({ code: 1, message: '新日期/时间与原排课相同，无需补课', data: null }, 400)
    }

    const operatorId = context.admin?.id || ''
    const result = await makeupSchedule(original, {
      newDate,
      newStartTime: newStartTime || '',
      newEndTime: newEndTime || '',
      reason: reason || '',
      operatorId,
      newTeacher: newTeacher !== undefined ? newTeacher : undefined,
      newCourseId: newCourseId !== undefined ? newCourseId : undefined,
      newCourseName: newCourseName !== undefined ? newCourseName : undefined,
      newClassId: newClassId !== undefined ? newClassId : undefined,
      newLocation: newLocation !== undefined ? newLocation : undefined,
      newColor: newColor !== undefined ? newColor : undefined,
    })

    const targetName = `${original.studentName} ${original.courseName}`
    await writeAudit(context, {
      action: 'create',
      module: 'schedules',
      targetType: 'schedule',
      targetId: result.newScheduleId,
      targetName,
      summary: `补课「${targetName}」：补 ${original.date} ${original.startTime || ''} 的缺勤，安排到 ${newDate} ${newStartTime || original.startTime || ''}` + (reason ? `（${reason}）` : ''),
      before: original,
      after: { ...original, id: result.newScheduleId, date: newDate, startTime: newStartTime || original.startTime, endTime: newEndTime || original.endTime, makeupFor: original.id },
    })

    return json({
      code: 0,
      message: `已补课：原 ${original.date} → 新 ${newDate}`,
      data: {
        originalScheduleId: original.id,
        newScheduleId: result.newScheduleId,
      },
    })
  } catch (e) {
    console.error('[schedule-makeup] 补课异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '补课失败，请稍后重试', data: null }, 500)
  }
}
