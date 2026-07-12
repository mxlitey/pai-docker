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
  const method = options?.method || 'GET'
  // GET/HEAD 请求不发送 Content-Type（避免某些代理/环境对空 body 的 GET 做异常处理）
  const isBodyMethod = method !== 'GET' && method !== 'HEAD'
  let resp: Response
  try {
    resp = await fetch(url, {
      ...options,
      headers: {
        ...(isBodyMethod ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {}),
      },
    })
  } catch {
    throw new Error('网络请求失败，请检查网络连接')
  }

  if (resp.status === 401) {
    throw new Error('未登录或登录已过期')
  }

  // 不检查 content-type，直接尝试解析 JSON（兼容某些代理可能修改 content-type 的情况）
  const text = await resp.text()
  let json: { code: number; message?: string; data?: T }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`服务暂不可用（HTTP ${resp.status}）`)
  }

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
// 家长通过专属链接（含学员 ID）进入，需输入手机号后4位验真

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

export interface ParentAnnouncement {
  content: string
  updatedAt: string
}

export interface ParentAccessData {
  student: { id: string; name: string; grade: string; parentName: string }
  schedules: Schedule[]
  enrollments: ParentEnrollmentSummary[]
  feedback: import('@/types').Feedback[]
  announcement: ParentAnnouncement
}

// GET：返回脱敏提示信息（家长进入 H5 时先调）
export async function getParentAccessHint(
  studentId: string,
): Promise<ParentAccessHint> {
  const qs = new URLSearchParams({ s: studentId })
  const data = await request<ParentAccessHint>(`${API_BASE}/parent-access?${qs}`)
  return data
}

// POST：校验手机号后4位，通过后返回完整数据
export async function verifyParentAccess(
  studentId: string,
  phoneSuffix: string,
): Promise<ParentAccessData> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/parent-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, phoneSuffix }),
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
