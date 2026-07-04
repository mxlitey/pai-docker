// API 调用层 —— 优先请求后端 Edge Functions，失败时回退到本地 mock 数据
import type { Schedule, Student } from '@/types'
import { mockSearchStudents, mockGetSchedules } from './mock-data'

const API_BASE = '/api'

// 通用请求封装：尝试后端，失败回退 mock
async function fetchWithFallback<T>(
  url: string,
  mockFn: () => T,
): Promise<T> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const json = await resp.json()
    if (json.code !== 0) throw new Error(json.message)
    return json.data as T
  } catch {
    // 后端不可用（本地开发），回退 mock
    return mockFn()
  }
}

// 学员搜索（精确+模糊）
export async function searchStudents(q: string): Promise<Student[]> {
  return fetchWithFallback(
    `${API_BASE}/students?q=${encodeURIComponent(q)}`,
    () => ({ students: mockSearchStudents(q) }),
  ).then((d) => d.students)
}

// 排课查询（按学员ID + 可选日期范围）
export async function getSchedules(
  studentId: string,
  startDate?: string,
  endDate?: string,
): Promise<Schedule[]> {
  const params = new URLSearchParams({ studentId })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  return fetchWithFallback(
    `${API_BASE}/schedules?${params}`,
    () => ({ schedules: mockGetSchedules(studentId, startDate, endDate) }),
  ).then((d) => d.schedules)
}

// 按学员姓名查询排课
export async function getSchedulesByName(
  studentName: string,
  startDate?: string,
  endDate?: string,
): Promise<Schedule[]> {
  const params = new URLSearchParams({ studentName })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  return fetchWithFallback(
    `${API_BASE}/schedules?${params}`,
    () => {
      const students = mockSearchStudents(studentName)
      const exact = students.find((s) => s.name === studentName)
      if (exact) return { schedules: mockGetSchedules(exact.id, startDate, endDate) }
      return { schedules: [] }
    },
  ).then((d) => d.schedules)
}

// 种子数据初始化（部署后调用一次）
export async function seedData(): Promise<boolean> {
  try {
    const resp = await fetch(`${API_BASE}/seed`, { method: 'POST' })
    const json = await resp.json()
    return json.code === 0
  } catch {
    return false
  }
}
