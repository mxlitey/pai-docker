// 排课冲突检测 API（智能排课助手）
// POST /api/schedule-check-conflict
// body: {
//   studentId, courseId, teacher, location,
//   dates: string[],         // 待检测的多个日期
//   startTime, endTime,
// }
// 返回：每个日期的冲突结果 { results: [{ date, conflicts: [...] }] }
// 鉴权：需 schedules:view 权限（查看排课即可使用排课助手）
import { findScheduleConflicts, getStudentById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'schedules:view')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { studentId, teacher, location, dates, startTime, endTime } = body

  if (!Array.isArray(dates) || dates.length === 0) {
    return json({ code: 1, message: '请至少选择一个日期', data: null }, 400)
  }
  if (!startTime || !endTime) {
    return json({ code: 1, message: '请选择起止时间', data: null }, 400)
  }
  for (const d of dates) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return json({ code: 1, message: `日期格式应为 yyyy-MM-dd，当前为 "${d}"`, data: null }, 400)
    }
  }

  // 学员存在性校验（若提供）
  if (studentId) {
    const stu = await getStudentById(studentId)
    if (!stu) {
      return json({ code: 1, message: '学员不存在', data: null }, 404)
    }
  }

  const results = []
  for (const date of dates) {
    const conflicts = await findScheduleConflicts({
      studentId: studentId || '',
      teacher: teacher || '',
      location: location || '',
      date,
      startTime,
      endTime,
    })
    results.push({ date, conflicts })
  }

  const freeCount = results.filter((r) => r.conflicts.length === 0).length
  return json({
    code: 0,
    message: 'ok',
    data: { results, total: results.length, free: freeCount, conflict: results.length - freeCount },
  })
}
