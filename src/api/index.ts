// API 调用层 —— 直接请求后端 Edge Functions
import type { Schedule, Student } from '@/types'

const API_BASE = '/api'
const TOKEN_KEY = 'admin_token'

// 通用请求封装：校验响应并提取数据（自动携带后台 token）
async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  let resp: Response
  try {
    resp = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

// 公告信息
export interface AnnouncementInfo {
  content: string
  updatedAt: string
}

// 公开读取公告（首页与日历页异步加载，无需鉴权）
// 失败时静默返回空内容，前端按「无公告」处理，不阻塞主流程
export async function getAnnouncement(): Promise<AnnouncementInfo> {
  try {
    const data = await request<AnnouncementInfo>(`${API_BASE}/announcement`)
    return data
  } catch {
    return { content: '', updatedAt: '' }
  }
}

// 系统配置（公开，前端首屏加载用）
export interface SystemConfig {
  appName: string
}

// 读取系统配置：首屏调用，设置 appName 等运行时配置
// 失败时静默使用默认值，不阻塞渲染
export async function getConfig(): Promise<SystemConfig> {
  try {
    return await request<SystemConfig>(`${API_BASE}/config`)
  } catch {
    return { appName: '排课系统' }
  }
}

// ========== 家长端 H5 专属访问 ==========
// 家长通过专属链接（含 token）进入，需输入手机号后4位二次校验

export interface ParentAccessHint {
  studentId: string
  studentName: string
  phoneHint: string
}

export interface ParentEnrollmentSummary {
  courseId: string
  courseName: string
  status: string
  purchasedHours: number
  giftHours: number
  remainingHours: number
  remainingPaidHours: number
  remainingGiftHours: number
  expiredAt: string
}

export interface ParentAccessData {
  student: { id: string; name: string; grade: string; parentName: string }
  schedules: Schedule[]
  enrollments: ParentEnrollmentSummary[]
  feedback: import('@/types').Feedback[]
}

// GET：校验 token，返回脱敏提示信息（家长进入 H5 时先调）
export async function getParentAccessHint(
  studentId: string,
  token: string,
): Promise<ParentAccessHint> {
  const qs = new URLSearchParams({ s: studentId, t: token })
  const data = await request<ParentAccessHint>(`${API_BASE}/parent-access?${qs}`)
  return data
}

// POST：二次校验手机号后4位，通过后返回完整数据
export async function verifyParentAccess(
  studentId: string,
  token: string,
  phoneSuffix: string,
): Promise<ParentAccessData> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/parent-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, token, phoneSuffix }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new Error('网络请求失败，请检查网络连接')
  }
  const result = await resp.json()
  if (result.code !== 0) {
    throw new Error(result.message || '校验失败')
  }
  return result.data as ParentAccessData
}
