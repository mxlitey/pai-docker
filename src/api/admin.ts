// 后台管理 API 调用层 —— 直接请求后端 Edge Functions
// 所有管理类请求需携带登录 token（Authorization: Bearer <token>）
import type { Schedule } from '@/types'

const API_BASE = '/api'
const TOKEN_KEY = 'admin_token'

interface ApiResult<T> {
  code: number
  message: string
  data: T
}

// ========== Token 管理 ==========
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ========== 登录 ==========
export async function login(password: string): Promise<ApiResult<{ token: string }>> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new Error('网络请求失败，请检查网络连接')
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('服务暂不可用，请稍后重试')
  }

  const result = await resp.json()
  if (result.code === 0) {
    setToken(result.data.token)
  }
  return result
}

// ========== 通用请求（带鉴权） ==========
async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  const token = getToken()
  let resp: Response
  try {
    resp = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new Error('网络请求失败，请检查网络连接')
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('服务暂不可用，请稍后重试')
  }

  // 401 未授权：清除本地 token
  if (resp.status === 401) {
    clearToken()
    const result = await resp.json()
    throw new Error(result.message || '未登录或登录已过期')
  }

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
  students?: any[]
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
