// 种子数据初始化 API
// POST /api/seed -> 写入示例学员与排课数据到 Blob 存储
import {
  saveStudents,
  saveSchedulesByMonth,
  json,
} from '../_lib/store.js'
import { getSeedData } from '../_lib/seed-data.js'

export async function onRequestPost() {
  const { students, schedulesByStudentMonth } = getSeedData()

  // 写入学员列表
  await saveStudents(students)

  // 按学员+月份写入排课
  let totalSchedules = 0
  for (const [key, schedules] of Object.entries(schedulesByStudentMonth)) {
    const [studentId, month] = key.split('/')
    await saveSchedulesByMonth(studentId, month, schedules)
    totalSchedules += schedules.length
  }

  return json({
    code: 0,
    message: '种子数据初始化成功',
    data: {
      studentCount: students.length,
      scheduleCount: totalSchedules,
      monthFiles: Object.keys(schedulesByStudentMonth).length,
    },
  })
}

// 也支持 GET 方便浏览器直接触发
export async function onRequestGet() {
  return onRequestPost()
}
