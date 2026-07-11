// 调课 API
// POST /api/schedule-reschedule
// body: { scheduleId, newDate, newStartTime?, newEndTime?, reason? }
// 逻辑：原排课标记 cancelled → 新排课插入（复制原数据改时间）→ 写入 schedule_changes 记录
// 约束：已点名的排课不允许调课（需先改缺勤回退课时）；已取消的排课不允许重复调课
import { getScheduleById, rescheduleSchedule, json } from '../_lib/store.js'
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
  const authFail = await requirePermission(context, 'schedules:reschedule')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  let {
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
    // 教师角色校验排课归属
    if (context.admin.role === 'teacher') {
      const teacherName = context.admin.realName || context.admin.username
      if (original.teacher !== teacherName) {
        return json({ code: 1, message: '无权操作其他教师的排课', data: null }, 403)
      }
      // 禁止教师覆盖教师字段，强制使用原排课教师
      newTeacher = original.teacher
    }
    // 已取消的排课不允许调课
    if (original.status === 'cancelled') {
      return json({ code: 1, message: '已取消的排课不允许调课', data: null }, 409)
    }
    // 已点名的排课不允许调课（需先改缺勤回退课时）
    if (original.attended === true) {
      return json(
        { code: 1, message: '已点名的排课不允许调课，请先在点名管理中改为缺勤以回退课时', data: null },
        409,
      )
    }
    // 新日期/时间与原排课相同，且未改任何插班字段 → 无需调课
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
      return json({ code: 1, message: '新日期/时间与原排课相同，无需调课', data: null }, 400)
    }

    const operatorId = context.admin?.id || ''
    const result = await rescheduleSchedule(original, {
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
      action: 'update',
      module: 'schedules',
      targetType: 'schedule',
      targetId: original.id,
      targetName,
      summary: `调课「${targetName}」：${original.date} ${original.startTime || ''} → ${newDate} ${newStartTime || original.startTime || ''}` + (reason ? `（${reason}）` : ''),
      before: original,
      after: { ...original, id: result.newScheduleId, date: newDate, startTime: newStartTime || original.startTime, endTime: newEndTime || original.endTime },
    })

    return json({
      code: 0,
      message: `已调课：${original.date} → ${newDate}`,
      data: {
        changeId: result.changeId,
        originalScheduleId: original.id,
        newScheduleId: result.newScheduleId,
      },
    })
  } catch (e) {
    console.error('[schedule-reschedule] 调课异常:', e?.message || String(e))
    return json({ code: 1, message: '操作失败，请稍后重试', data: null }, 500)
  }
}
