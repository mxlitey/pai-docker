// 后台管理 API 调用层
// 管理类操作不回退 mock（避免误操作本地数据），直接请求后端
import type { Schedule } from '@/types'

const API_BASE = '/api'

interface ApiResult<T> {
  code: number
  message: string
  data: T
}

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  })
  return resp.json()
}

// 种子数据初始化
export async function seedData(): Promise<ApiResult<{
  studentCount: number
  scheduleCount: number
  monthFiles: number
}>> {
  return request(`${API_BASE}/seed`, { method: 'POST' })
}

// 清空所有数据
export async function clearAllData(): Promise<ApiResult<{
  deletedCount: number
  keys: string[]
}>> {
  return request(`${API_BASE}/clear`, { method: 'POST' })
}

// JSON 数据导入
export async function importData(body: {
  mode?: 'merge' | 'replace'
  students?: Schedule[] | any[]
  schedules?: Schedule[]
}): Promise<ApiResult<{
  mode: string
  studentCount: number
  importedStudents: number
  importedSchedules: number
  monthFiles: number
}>> {
  return request(`${API_BASE}/import`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// 修改排课（含跨月处理）
export async function updateSchedule(
  oldSchedule: Schedule,
  newSchedule: Schedule,
): Promise<ApiResult<{
  moved: boolean
  fromKey: string
  toKey: string
  schedule: Schedule
}>> {
  return request(`${API_BASE}/schedule-update`, {
    method: 'PUT',
    body: JSON.stringify({ old: oldSchedule, new: newSchedule }),
  })
}

// 删除排课
export async function deleteSchedule(
  id: string,
  studentId: string,
  date: string,
): Promise<ApiResult<{ deleted: boolean; count: number }>> {
  return request(`${API_BASE}/schedule-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ id, studentId, date }),
  })
}
