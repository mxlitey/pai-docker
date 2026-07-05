// 学员信息
export interface Student {
  id: string
  name: string
  phone?: string
  grade?: string
  // 课时（1 节排课 = 1 课时）
  hours?: number // 总课时（购课总数）
  remainingHours?: number // 剩余课时（点名到课时扣减，改缺勤回退）
}

// 课程信息
export interface Course {
  id: string
  name: string
  teacher?: string
  location?: string
  color?: string // 颜色标签 key，如 'blue'/'green'
  defaultStartTime?: string // HH:mm
  defaultEndTime?: string // HH:mm
}

// 排课记录
export interface Schedule {
  id: string
  studentId: string
  studentName: string
  courseId?: string // 新增：关联课程 id（历史记录可能为空）
  courseName: string
  teacher: string
  location: string
  date: string // yyyy-MM-dd
  startTime: string // HH:mm
  endTime: string // HH:mm
  note?: string
  color?: string // 从课程带过来的颜色标签 key
  attended?: boolean // 出勤状态：true=到课，false=缺勤，undefined=未点名
}

// 日历视图模式
export type ViewMode = 'month' | 'week' | 'day'

// API 响应
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

// 学员查询结果
export interface StudentSearchResult {
  students: Student[]
}

// 排课查询结果
export interface ScheduleQueryResult {
  schedules: Schedule[]
}

// 按日期分组的排课
export type SchedulesByDate = Record<string, Schedule[]>

// 日历单元格数据
export interface CalendarCell {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  schedules: Schedule[]
}
