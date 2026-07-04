// 种子数据 —— 用于初始化 Blob 存储
// 生成 2026年7月的排课数据，覆盖多名学员

const students = [
  { id: 's001', name: '张伟', phone: '13800001001', grade: '高三' },
  { id: 's002', name: '李娜', phone: '13800001002', grade: '高二' },
  { id: 's003', name: '王芳', phone: '13800001003', grade: '高一' },
  { id: 's004', name: '刘洋', phone: '13800001004', grade: '初三' },
  { id: 's005', name: '陈静', phone: '13800001005', grade: '高三' },
  { id: 's006', name: '赵磊', phone: '13800001006', grade: '高二' },
  { id: 's007', name: '孙丽', phone: '13800001007', grade: '高一' },
  { id: 's008', name: '周强', phone: '13800001008', grade: '高三' },
]

// 生成排课数据：每位学员在 2026-07 有若干节课
function generateSchedules() {
  const schedules = []
  const courses = [
    { courseName: '数学提高班', teacher: '张老师', location: 'A教室201' },
    { courseName: '英语冲刺班', teacher: '李老师', location: 'B教室105' },
    { courseName: '物理精品课', teacher: '王老师', location: 'C教室302' },
    { courseName: '化学专项课', teacher: '刘老师', location: 'A教室203' },
    { courseName: '语文阅读课', teacher: '赵老师', location: 'B教室107' },
    { courseName: '生物实验课', teacher: '孙老师', location: '实验楼401' },
  ]
  const timeSlots = [
    { start: '08:00', end: '09:30' },
    { start: '10:00', end: '11:30' },
    { start: '14:00', end: '15:30' },
    { start: '16:00', end: '17:30' },
    { start: '19:00', end: '20:30' },
  ]
  let idCounter = 1

  for (const student of students) {
    // 每位学员在7月有 8-12 节课
    const count = 8 + Math.floor(Math.random() * 5)
    const usedDates = new Set()
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(Math.random() * 31)
      const dateDay = String(day).padStart(2, '0')
      const date = `2026-07-${dateDay}`
      if (usedDates.has(date)) continue
      usedDates.add(date)

      const course = courses[Math.floor(Math.random() * courses.length)]
      const slot = timeSlots[Math.floor(Math.random() * timeSlots.length)]
      schedules.push({
        id: `sch_${String(idCounter++).padStart(4, '0')}`,
        studentId: student.id,
        studentName: student.name,
        courseName: course.courseName,
        teacher: course.teacher,
        location: course.location,
        date,
        startTime: slot.start,
        endTime: slot.end,
        note: '',
      })
    }
  }
  return schedules
}

// 获取完整种子数据（按学员+月份组织）
export function getSeedData() {
  const allSchedules = generateSchedules()
  // 按学员ID → 月份组织
  const schedulesByStudentMonth = {}
  for (const s of allSchedules) {
    const month = s.date.slice(0, 7) // yyyy-MM
    const key = `${s.studentId}/${month}`
    if (!schedulesByStudentMonth[key]) schedulesByStudentMonth[key] = []
    schedulesByStudentMonth[key].push(s)
  }
  return { students, schedulesByStudentMonth }
}
