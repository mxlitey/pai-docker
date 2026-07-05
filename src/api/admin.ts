// 后台管理 API 调用层 —— 直接请求后端 Edge Functions
// 所有管理类请求需携带登录 token（Authorization: Bearer <token>）
import type { Schedule, Student, Course } from '@/types'

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
    return { code: -1, message: '网络请求失败，请检查网络连接', data: null as any }
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return { code: -1, message: '服务暂不可用，请稍后重试', data: null as any }
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

// 新增排课
export async function addSchedule(
  schedule: Schedule,
): Promise<ApiResult<{
  created: boolean
  key: string
  exists: boolean
  schedule: Schedule
}>> {
  return request(`${API_BASE}/schedule-add`, {
    method: 'POST',
    body: JSON.stringify({ schedule }),
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

// 删除学员及其所有排课
export async function deleteStudent(
  studentId: string,
): Promise<ApiResult<{ deletedScheduleFiles: number; studentRemoved: boolean }>> {
  return request(`${API_BASE}/student-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ studentId }),
  })
}

// 新增学员
export async function addStudent(
  student: Student,
): Promise<ApiResult<{
  created: boolean
  exists: boolean
  student: Student
}>> {
  return request(`${API_BASE}/student-add`, {
    method: 'POST',
    body: JSON.stringify({ student }),
  })
}

// 更新学员（若姓名变更，后端会级联更新排课中的 studentName）
export async function updateStudent(
  student: Student,
): Promise<ApiResult<{
  updated: boolean
  notFound: boolean
  nameChanged: boolean
  updatedScheduleFiles: number
  student: Student
}>> {
  return request(`${API_BASE}/student-update`, {
    method: 'PUT',
    body: JSON.stringify({ student }),
  })
}

// ========== 课程管理 ==========

// 获取课程列表
export async function listCourses(): Promise<ApiResult<{ courses: Course[] }>> {
  return request(`${API_BASE}/courses`, { method: 'GET' })
}

// 新增课程
export async function addCourse(
  course: Course,
): Promise<ApiResult<{
  created: boolean
  exists: boolean
  course: Course
}>> {
  return request(`${API_BASE}/course-add`, {
    method: 'POST',
    body: JSON.stringify({ course }),
  })
}

// 更新课程
export async function updateCourse(
  course: Course,
): Promise<ApiResult<{
  updated: boolean
  notFound: boolean
  course: Course
}>> {
  return request(`${API_BASE}/course-update`, {
    method: 'PUT',
    body: JSON.stringify({ course }),
  })
}

// 删除课程（同时删除关联排课）
export async function deleteCourse(
  courseId: string,
): Promise<ApiResult<{
  courseRemoved: boolean
  deletedScheduleCount: number
  deletedFiles: number
}>> {
  return request(`${API_BASE}/course-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ courseId }),
  })
}

// 批量新增排课（按课程为多个学员在多个日期同时排课）
export async function batchAddSchedules(body: {
  courseId: string
  courseName: string
  teacher?: string
  location?: string
  color?: string
  dates: string[] // 多日期，每个 yyyy-MM-dd
  startTime?: string
  endTime?: string
  note?: string
  studentIds: string[]
}): Promise<ApiResult<{ created: number; skipped: number; errors: string[]; totalAttempts?: number }>> {
  return request(`${API_BASE}/schedule-add-batch`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// 跨学员搜索排课：按日期范围 + 可选课程 ID 过滤
// 任一参数可缺省；全部缺省时返回全量排课
export async function searchSchedules(params: {
  startDate?: string
  endDate?: string
  courseId?: string
}): Promise<ApiResult<{ schedules: Schedule[]; total: number }>> {
  const qs = new URLSearchParams()
  if (params.startDate) qs.set('startDate', params.startDate)
  if (params.endDate) qs.set('endDate', params.endDate)
  if (params.courseId) qs.set('courseId', params.courseId)
  const query = qs.toString()
  return request(`${API_BASE}/schedules-search${query ? '?' + query : ''}`, { method: 'GET' })
}

// 保存公告（鉴权写入）
export async function saveAnnouncement(
  content: string,
): Promise<ApiResult<{ content: string; updatedAt: string }>> {
  return request(`${API_BASE}/announcement`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}
