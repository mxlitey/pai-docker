// 排课查询 API
// GET /api/schedules?studentId=s001&startDate=2026-07-01&endDate=2026-07-31
// GET /api/schedules?studentName=张伟&startDate=2026-07-01&endDate=2026-07-31
// 未传日期范围时返回该学员所有排课
import {
  getStudents,
  getAllSchedulesByStudent,
  getSchedulesByDateRange,
  json,
} from '../_lib/store.js'

export default async function onRequestGet({ request }) {
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

  // 按日期+时间排序
  schedules.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.startTime.localeCompare(b.startTime)
  })

  return json({ code: 0, message: 'ok', data: { schedules } })
}
