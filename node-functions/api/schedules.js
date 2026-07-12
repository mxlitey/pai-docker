// 排课查询 API
// GET /api/schedules?studentId=s001&startDate=2026-07-01&endDate=2026-07-31
// GET /api/schedules?studentName=张伟&startDate=2026-07-01&endDate=2026-07-31
// 未传日期范围时返回该学员所有排课（需 schedules:view 权限）
import {
  getStudents,
  getAllSchedulesByStudent,
  getSchedulesByDateRange,
  getScheduleIdsWithMakeup,
  json,
} from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'schedules:view')
  if (authFail) return authFail

  const { request } = context
  const url = new URL(request.url)
  const studentId = url.searchParams.get('studentId')
  const studentName = url.searchParams.get('studentName')
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')

  // 确定学员ID
  let targetId = studentId
  if (!targetId && studentName) {
    const students = await getStudents()
    const matched = students.find((s) => s.name === studentName)
    if (!matched) {
      return json({ code: 0, message: 'ok', data: { schedules: [] } })
    }
    targetId = matched.id
  }

  if (!targetId) {
    return json({
      code: 1,
      message: '缺少 studentId 或 studentName 参数',
      data: { schedules: [] },
    })
  }

  let schedules
  if (startDate && endDate) {
    schedules = await getSchedulesByDateRange(targetId, startDate, endDate)
  } else {
    schedules = await getAllSchedulesByStudent(targetId)
  }
  // 教师角色仅返回自己的排课
  if (context.admin.role === 'teacher') {
    const teacherName = context.admin.realName || context.admin.username
    schedules = schedules.filter((s) => s.teacher === teacherName)
  }
  // 过滤已取消的排课（调课后原记录标记为 cancelled）
  schedules = schedules.filter((s) => s.status !== 'cancelled')

  // 按日期+时间排序
  schedules.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.startTime.localeCompare(b.startTime)
  })

  // 批量标记哪些缺勤排课已安排补课（补课按钮隐藏依据）
  const idsWithMakeup = await getScheduleIdsWithMakeup(schedules.map((s) => s.id))
  schedules = schedules.map((s) => ({ ...s, hasMakeup: idsWithMakeup.has(s.id) }))

  return json({ code: 0, message: 'ok', data: { schedules } })
}
