// API 调用层 —— 直接请求后端 Edge Functions
import type { Schedule, Student } from '@/types'

const API_BASE = '/api'

// 通用请求封装：校验响应并提取数据
async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      signal: AbortSignal.timeout(10000),
    })
  } catch (e) {
    throw new Error('网络请求失败，请检查网络连接')
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('服务暂不可用，请稍后重试')
  }

  const json = await resp.json()
  if (json.code !== 0) {
    throw new Error(json.message || '请求失败')
  }
  return json.data as T
}

// 学员搜索（精确+模糊）
export async function searchStudents(q: string): Promise<Student[]> {
  const data = await request<{ students: Student[] }>(
    `${API_BASE}/students?q=${encodeURIComponent(q)}`,
  )
  return data.students
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
  const data = await request<{ schedules: Schedule[] }>(
    `${API_BASE}/schedules?${params}`,
  )
  return data.schedules
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
  const data = await request<{ schedules: Schedule[] }>(
    `${API_BASE}/schedules?${params}`,
  )
  return data.schedules
}
