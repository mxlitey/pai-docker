// 排课批量修改 API
// PUT /api/schedule-update-batch  body: { items: [{ old: Schedule, new: Schedule }] }
// 用于"聚合全班修改"：操作员选择同班同时段的多条排课，统一修改时间/教师/地点等字段
// 每条排课独立处理，单条失败不影响其他条
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

// 校验排课记录必填字段与格式（与 schedule-update 规则一致）
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
  const items = body.items

  if (!Array.isArray(items) || items.length === 0) {
    return json({ code: 1, message: '缺少 items 数组', data: null }, 400)
  }
  if (items.length > 100) {
    return json({ code: 1, message: '单次最多修改 100 条排课', data: null }, 400)
  }

  const details = []
  let updated = 0
  let failed = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const { old: oldSchedule, new: newSchedule } = item
    const itemLabel = `第 ${i + 1} 条`

    try {
      if (!oldSchedule || !newSchedule) {
        throw new Error(`${itemLabel}: 缺少 old/new`)
      }
      validateSchedule(oldSchedule, itemLabel + ' old')
      validateSchedule(newSchedule, itemLabel + ' new')

      if (oldSchedule.id !== newSchedule.id) {
        throw new Error(`${itemLabel}: 排课 id 不可修改`)
      }

      // 状态校验：已到课/缺勤/已取消的排课不允许编辑
      const current = await getScheduleById(oldSchedule.id)
      if (!current) {
        throw new Error(`${itemLabel}: 排课 ${oldSchedule.id} 不存在`)
      }
      if (current.status === 'cancelled') {
        throw new Error(`${itemLabel}: 排课 ${oldSchedule.id} 已取消，不可修改`)
      }
      if (current.attended === true) {
        throw new Error(`${itemLabel}: 排课 ${oldSchedule.id} 已点名到课，不可修改`)
      }
      if (current.attended === false) {
        throw new Error(`${itemLabel}: 排课 ${oldSchedule.id} 已标记缺勤，不可修改`)
      }

      // 跨表关联校验
      const student = await getStudentById(newSchedule.studentId)
      if (!student) {
        throw new Error(`${itemLabel}: 学员 ${newSchedule.studentId} 不存在`)
      }
      const course = await getCourseById(newSchedule.courseId)
      if (!course) {
        throw new Error(`${itemLabel}: 课程 ${newSchedule.courseId} 不存在`)
      }
      if (newSchedule.classId) {
        const cls = await getClassById(newSchedule.classId)
        if (!cls) {
          throw new Error(`${itemLabel}: 班级 ${newSchedule.classId} 不存在`)
        }
        // 班级成员校验（与 schedule-update 一致）
        const members = await getClassMembers(newSchedule.classId)
        if (!members.some((m) => m.id === newSchedule.studentId)) {
          throw new Error(`${itemLabel}: 学员「${student.name}」不属于班级「${cls.name}」`)
        }
      }
      // 报名校验：改了课程时，学员必须已报名新课程
      if (newSchedule.courseId && newSchedule.courseId !== (oldSchedule.courseId || '')) {
        const enrs = await getEnrollments({ studentId: newSchedule.studentId, courseId: newSchedule.courseId, status: 'active' })
        if (!enrs || enrs.length === 0) {
          throw new Error(`${itemLabel}: 学员「${student.name}」未报名该课程`)
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
      details.push({ id: oldSchedule.id, success: true, moved: result.moved })
      updated++
    } catch (e) {
      failed++
      details.push({
        id: oldSchedule?.id || '',
        success: false,
        message: e?.message || String(e),
      })
    }
  }

  const message =
    failed === 0
      ? `已更新 ${updated} 条排课`
      : `已更新 ${updated} 条，失败 ${failed} 条`
  return json({
    code: failed === 0 ? 0 : 1,
    message,
    data: { updated, failed, details },
  })
}
