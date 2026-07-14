// 排课修改 API
// PUT /api/schedule  body: { old: Schedule, new: Schedule }
// 处理跨月/跨学员的存储路径迁移
import { updateSchedule, getScheduleById, getStudentById, getCourseById, getClassById, getClassMembers, getEnrollments, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit, buildUpdateSummary } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验排课记录必填字段与格式（与 schedule-add 规则一致）
function validateSchedule(s, prefix) {
  if (!s) throw new Error(`${prefix}: 数据不能为空`)
  if (!s.id) throw new Error(`${prefix}: 缺少 id`)
  if (!s.studentId) throw new Error(`${prefix}: 缺少 studentId`)
  if (!s.courseId) throw new Error(`${prefix}: 缺少 courseId`)
  if (!s.courseName) throw new Error(`${prefix}: 缺少 courseName`)
  if (!s.classId) throw new Error(`${prefix}: 缺少 classId（班级为必填项）`)
  if (!s.date) throw new Error(`${prefix}: 缺少 date`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
    throw new Error(`${prefix}: date 格式应为 yyyy-MM-dd`)
  }
  if (s.startTime && !/^\d{2}:\d{2}$/.test(s.startTime)) {
    throw new Error(`${prefix}: startTime 格式应为 HH:mm`)
  }
  if (s.endTime && !/^\d{2}:\d{2}$/.test(s.endTime)) {
    throw new Error(`${prefix}: endTime 格式应为 HH:mm`)
  }
}

export default async function onRequestPut(context) {
  const authFail = await requirePermission(context, 'schedules:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { old: oldSchedule, new: newSchedule } = body

  if (!oldSchedule || !newSchedule) {
    return json(
      { code: 1, message: '请求体需包含 old 和 new 两个字段', data: null },
      400,
    )
  }

  try {
    validateSchedule(oldSchedule, 'old')
    validateSchedule(newSchedule, 'new')
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  if (oldSchedule.id !== newSchedule.id) {
    return json(
      { code: 1, message: '排课 id 不可修改', data: null },
      400,
    )
  }

  try {
    // 状态校验：已到课/缺勤/已取消的排课不允许编辑
    const current = await getScheduleById(oldSchedule.id)
    if (!current) {
      return json({ code: 1, message: '排课记录不存在', data: null }, 404)
    }
    if (current.status === 'cancelled') {
      return json({ code: 1, message: '已取消的排课不允许编辑', data: null }, 409)
    }
    if (current.attended === true) {
      return json({ code: 1, message: '已到课的排课不允许编辑', data: null }, 409)
    }
    if (current.attended === false) {
      return json({ code: 1, message: '已缺勤的排课不允许编辑', data: null }, 409)
    }

    // 跨表关联校验：newSchedule 的 studentId / courseId / classId 必须在对应表中存在
    const student = await getStudentById(newSchedule.studentId)
    if (!student) {
      return json({ code: 1, message: `studentId="${newSchedule.studentId}" 在学员表中不存在`, data: null }, 400)
    }
    const course = await getCourseById(newSchedule.courseId)
    if (!course) {
      return json({ code: 1, message: `courseId="${newSchedule.courseId}" 在课程表中不存在`, data: null }, 400)
    }
    if (newSchedule.classId) {
      const cls = await getClassById(newSchedule.classId)
      if (!cls) {
        return json({ code: 1, message: `classId="${newSchedule.classId}" 在班级表中不存在`, data: null }, 400)
      }
      // 班级成员校验（与 schedule-add-batch 一致）：学员必须属于该班级
      const members = await getClassMembers(newSchedule.classId)
      if (!members.some((m) => m.id === newSchedule.studentId)) {
        return json({ code: 1, message: `学员「${student.name}」不属于班级「${cls.name}」，请先在班级管理中将其加入班级`, data: null }, 400)
      }
    }
    // 报名校验：改了课程时，学员必须已报名新课程
    if (newSchedule.courseId && newSchedule.courseId !== (oldSchedule.courseId || '')) {
      const enrs = await getEnrollments({ studentId: newSchedule.studentId, courseId: newSchedule.courseId, status: 'active' })
      if (!enrs || enrs.length === 0) {
        return json({ code: 1, message: `学员「${student.name}」未报名该课程，请先报名`, data: { noEnrollment: true } }, 400)
      }
    }

    const result = await updateSchedule(oldSchedule, newSchedule)
    const before = result.before || oldSchedule
    const after = result.after || newSchedule
    const targetName = newSchedule.studentName || ''
    await writeAudit(context, {
      action: 'update',
      module: 'schedules',
      targetType: 'schedule',
      targetId: newSchedule.id,
      targetName,
      summary: buildUpdateSummary('schedules', targetName, before, after),
      before,
      after,
    })
    const message = result.moved
      ? `排课已迁移：${result.fromKey} → ${result.toKey}`
      : `排课已更新：${result.toKey}`
    return json({
      code: 0,
      message,
      data: { ...result, schedule: newSchedule },
    })
  } catch (e) {
    console.error('[schedule-update] 更新异常:', e?.message || String(e))
    return json({ code: 1, message: '操作失败，请稍后重试', data: null }, 500)
  }
}
