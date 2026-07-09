// 新增排课 API
// POST /api/schedule-add  body: { schedule: Schedule }
// 用于后台少量新增排课，无需走完整的 JSON 导入流程
import { addSchedule, getStudentById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验排课记录必填字段与格式（id 由 store 层自动生成，此处不校验）
function validateSchedule(s) {
  if (!s) throw new Error('排课数据不能为空')
  if (!s.studentId) throw new Error('缺少 studentId')
  if (!s.courseName) throw new Error('缺少 courseName')
  if (!s.date) throw new Error('缺少 date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
    throw new Error('date 格式应为 yyyy-MM-dd')
  }
  if (s.startTime && !/^\d{2}:\d{2}$/.test(s.startTime)) {
    throw new Error('startTime 格式应为 HH:mm')
  }
  if (s.endTime && !/^\d{2}:\d{2}$/.test(s.endTime)) {
    throw new Error('endTime 格式应为 HH:mm')
  }
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'schedules:create')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { schedule } = body

  if (!schedule) {
    return json(
      { code: 1, message: '请求体需包含 schedule 字段', data: null },
      400,
    )
  }

  try {
    validateSchedule(schedule)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  // 跨表关联校验：studentId 必须在学员表中存在
  try {
    const student = await getStudentById(schedule.studentId)
    if (!student) {
      return json(
        { code: 1, message: `studentId="${schedule.studentId}" 在学员表中不存在`, data: null },
        400,
      )
    }

    // 自动补全 studentName
    const finalSchedule = {
      ...schedule,
      studentName: schedule.studentName || student.name || '',
      startTime: schedule.startTime || '',
      endTime: schedule.endTime || '',
      teacher: schedule.teacher || '',
      location: schedule.location || '',
      note: schedule.note || '',
    }

    const result = await addSchedule(finalSchedule)
    if (result.exists) {
      return json(
        { code: 1, message: '该排课记录已存在，不可重复新增', data: null },
        409,
      )
    }
    await writeAudit(context, {
      action: 'create',
      module: 'schedules',
      targetType: 'schedule',
      targetId: result.schedule?.id || result.key || '',
      targetName: `${finalSchedule.studentName} ${finalSchedule.courseName}`,
      summary: `排课 ${finalSchedule.studentName} ${finalSchedule.courseName} ${finalSchedule.date}`,
    })
    return json({
      code: 0,
      message: '排课已新增',
      data: { ...result, schedule: finalSchedule },
    })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[schedule-add] 新增异常:', e?.message || String(e))
    return json(
      { code: 1, message: '新增失败，请稍后重试', data: null },
      500,
    )
  }
}
