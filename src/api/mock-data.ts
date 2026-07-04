// 本地 mock 数据 —— 当后端 Edge Functions 不可用时回退使用
// 与后端种子数据保持一致，确保本地预览效果与部署后相同
import type { Schedule, Student } from '@/types'

const mockStudents: Student[] = [
  { id: 's001', name: '张伟', phone: '13800001001', grade: '高三' },
  { id: 's002', name: '李娜', phone: '13800001002', grade: '高二' },
  { id: 's003', name: '王芳', phone: '13800001003', grade: '高一' },
  { id: 's004', name: '刘洋', phone: '13800001004', grade: '初三' },
  { id: 's005', name: '陈静', phone: '13800001005', grade: '高三' },
  { id: 's006', name: '赵磊', phone: '13800001006', grade: '高二' },
  { id: 's007', name: '孙丽', phone: '13800001007', grade: '高一' },
  { id: 's008', name: '周强', phone: '13800001008', grade: '高三' },
]

const coursePool = [
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

// 用固定种子生成确定性数据，保证每次渲染一致
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function generateMockSchedules(): Schedule[] {
  const rand = seededRandom(20260704)
  const schedules: Schedule[] = []
  let idCounter = 1

  for (const student of mockStudents) {
    const count = 8 + Math.floor(rand() * 5)
    const usedDates = new Set<string>()
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(rand() * 31)
      const dateDay = String(day).padStart(2, '0')
      const date = `2026-07-${dateDay}`
      if (usedDates.has(date)) continue
      usedDates.add(date)

      const course = coursePool[Math.floor(rand() * coursePool.length)]
      const slot = timeSlots[Math.floor(rand() * timeSlots.length)]
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

const allMockSchedules = generateMockSchedules()

export function mockSearchStudents(q: string): Student[] {
  if (!q) return mockStudents
  const exact = mockStudents.filter((s) => s.name === q)
  const fuzzy = mockStudents.filter((s) => s.name !== q && s.name.includes(q))
  return [...exact, ...fuzzy]
}

export function mockGetSchedules(
  studentId: string,
  startDate?: string,
  endDate?: string,
): Schedule[] {
  let result = allMockSchedules.filter((s) => s.studentId === studentId)
  if (startDate && endDate) {
    result = result.filter((s) => s.date >= startDate && s.date <= endDate)
  }
  result.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.startTime.localeCompare(b.startTime)
  })
  return result
}

export function mockGetAllSchedules(): Schedule[] {
  return [...allMockSchedules].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.startTime.localeCompare(b.startTime)
  })
}
