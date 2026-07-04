// 通用数据导入 API
// POST /api/import  body: { students: [...], schedules: [...] }
// 支持一次性导入完整学员与排课数据，自动按学员+月份分文件写入 Blob
import {
  getStudents,
  saveStudents,
  getSchedulesByMonth,
  saveSchedulesByMonth,
  json,
} from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

// 处理 JSON 请求体
async function readBody(request) {
  try {
    const body = await request.json()
    return body || {}
  } catch {
    return {}
  }
}

// 校验单条学员数据
function validateStudent(s, index) {
  if (!s.id) throw new Error(`学员第${index + 1}条缺少 id`)
  if (!s.name) throw new Error(`学员第${index + 1}条缺少 name`)
}

// 校验单条排课数据
function validateSchedule(s, index) {
  if (!s.id) throw new Error(`排课第${index + 1}条缺少 id`)
  if (!s.studentId) throw new Error(`排课第${index + 1}条缺少 studentId`)
  if (!s.courseName) throw new Error(`排课第${index + 1}条缺少 courseName`)
  if (!s.date) throw new Error(`排课第${index + 1}条缺少 date`)
}

// 自动补全排课中的 studentName（若未提供）
function enrichSchedules(schedules, studentsById) {
  return schedules.map((s) => ({
    ...s,
    studentName: s.studentName || studentsById[s.studentId]?.name || '',
    startTime: s.startTime || '',
    endTime: s.endTime || '',
    teacher: s.teacher || '',
    location: s.location || '',
    note: s.note || '',
  }))
}

// 按学员+月份分组
function groupByStudentMonth(schedules) {
  const map = {}
  for (const s of schedules) {
    const month = s.date.slice(0, 7) // yyyy-MM
    const key = `${s.studentId}/${month}`
    if (!map[key]) map[key] = []
    map[key].push(s)
  }
  return map
}

export default async function onRequestPost({ request }) {
  const body = await readBody(request)
  const { students, schedules, mode } = body

  if (!Array.isArray(students) && !Array.isArray(schedules)) {
    return json(
      { code: 1, message: '请求体需包含 students 或 schedules 数组', data: null },
      400,
    )
  }

  // 合并学员数据
  let finalStudents = []
  if (Array.isArray(students)) {
    try {
      students.forEach(validateStudent)
    } catch (e) {
      return json({ code: 1, message: e.message, data: null }, 400)
    }
    if (mode === 'replace') {
      finalStudents = students
    } else {
      // 追加模式：合并已有学员，按 id 去重（新数据覆盖旧数据）
      const existing = await getStudents()
      const map = new Map(existing.map((s) => [s.id, s]))
      for (const s of students) map.set(s.id, s)
      finalStudents = Array.from(map.values())
    }
    await saveStudents(finalStudents)
  } else {
    finalStudents = await getStudents()
  }

  // 处理排课数据
  let totalSchedules = 0
  let monthFiles = 0
  if (Array.isArray(schedules) && schedules.length > 0) {
    try {
      schedules.forEach(validateSchedule)
    } catch (e) {
      return json({ code: 1, message: e.message, data: null }, 400)
    }
    const studentsById = finalStudents.reduce((acc, s) => {
      acc[s.id] = s
      return acc
    }, {})
    const enriched = enrichSchedules(schedules, studentsById)
    const grouped = groupByStudentMonth(enriched)

    for (const [key, monthSchedules] of Object.entries(grouped)) {
      const [studentId, month] = key.split('/')
      if (mode === 'replace') {
        // 替换模式：直接覆盖该月数据
        await saveSchedulesByMonth(studentId, month, monthSchedules)
      } else {
        // 追加模式：合并已有月份数据，按 id 去重
        const existing = await getSchedulesByMonth(studentId, month)
        const map = new Map(existing.map((s) => [s.id, s]))
        for (const s of monthSchedules) map.set(s.id, s)
        await saveSchedulesByMonth(studentId, month, Array.from(map.values()))
      }
      totalSchedules += monthSchedules.length
      monthFiles += 1
    }
  }

  return json({
    code: 0,
    message: '数据导入成功',
    data: {
      mode: mode || 'merge',
      studentCount: finalStudents.length,
      importedStudents: Array.isArray(students) ? students.length : 0,
      importedSchedules: totalSchedules,
      monthFiles,
    },
  })
}
