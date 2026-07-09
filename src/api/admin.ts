// 后台管理 API 调用层 —— 直接请求后端 Edge Functions
// 所有管理类请求需携带登录 token（Authorization: Bearer <token>）
import type {
  Schedule, Student, Course, Enrollment, Transfer,
  AdminUser, AdminRole, CurrentAdmin, AuditLog, ReportQuery,
  BackupInfo, SystemConfigFull, BatchEnrollmentItem,
  Feedback, TeacherPerformance, Coupon, Membership, StudentMembership,
  Lead, LeadFollowup, PermissionModule,
} from '@/types'

const API_BASE = '/api'
const TOKEN_KEY = 'admin_token'
const CURRENT_ADMIN_KEY = 'current_admin'

// 统一构造鉴权请求头（带 token）
function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface ApiResult<T> {
  code: number
  message: string
  data: T
}

// ========== Token / 当前用户管理 ==========
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(CURRENT_ADMIN_KEY)
}

// 缓存当前登录用户信息（登录/校验成功后写入，便于前端即时渲染顶栏）
export function setCurrentAdmin(admin: CurrentAdmin): void {
  localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(admin))
}

export function getCurrentAdmin(): CurrentAdmin | null {
  try {
    const raw = localStorage.getItem(CURRENT_ADMIN_KEY)
    return raw ? JSON.parse(raw) as CurrentAdmin : null
  } catch {
    return null
  }
}

// ========== 引导初始化（首次部署创建超管） ==========

// 查询当前是否处于引导模式（admins 表为空）
export async function getBootstrapStatus(): Promise<{ bootstrap: boolean }> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/auth/bootstrap`, {
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return { bootstrap: false }
  }
  const result = await resp.json().catch(() => ({ code: -1, data: { bootstrap: false } }))
  if (result.code === 0) {
    return { bootstrap: !!result.data?.bootstrap }
  }
  return { bootstrap: false }
}

// 引导创建超管账号（需提供用户名）
export async function bootstrapSuperAdmin(
  username: string,
  password: string,
  confirmPassword: string,
): Promise<ApiResult<{ username: string }>> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, confirmPassword }),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return { code: -1, message: '网络请求失败，请检查网络连接', data: null as never }
  }
  return resp.json()
}

// ========== 系统配置 ==========
export async function updateConfig(
  config: { appName?: string },
): Promise<ApiResult<{ appName?: string }>> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return { code: -1, message: '网络请求失败，请检查网络连接', data: null as never }
  }
  return resp.json()
}

// ========== 登录 ==========
// 登录（用户名 + 密码），成功返回 token + 当前用户信息
export async function login(
  username: string,
  password: string,
): Promise<ApiResult<{ token: string; admin: CurrentAdmin }>> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return { code: -1, message: '网络请求失败，请检查网络连接', data: null as never }
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return { code: -1, message: '服务暂不可用，请稍后重试', data: null as never }
  }

  const result = await resp.json()
  if (result.code === 0) {
    setToken(result.data.token)
    if (result.data.admin) setCurrentAdmin(result.data.admin)
  }
  return result
}

// ========== 通用请求（带鉴权） ==========
// 抛出 Error：网络错误 / 未授权 / 权限不足 / 服务错误
// 调用方按需 try/catch 处理
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

  if (resp.status === 401) {
    clearToken()
    const result = await resp.json().catch(() => ({ message: '未登录或登录已过期' }))
    throw new Error(result.message || '未登录或登录已过期')
  }
  if (resp.status === 403) {
    const result = await resp.json().catch(() => ({ message: '权限不足，无法执行此操作' }))
    throw new Error(result.message || '权限不足，无法执行此操作')
  }

  return resp.json()
}

// 校验 token 有效性（进入管理页时调用后端验证，防止本地伪造 token 绕过登录页）
export async function verifyAuth(): Promise<ApiResult<{
  valid: boolean
  bootstrap?: boolean
  admin?: CurrentAdmin
}>> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/auth`, {
      method: 'GET',
      headers: {
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return { code: -1, message: '网络请求失败，请检查网络连接', data: null as never }
  }

  if (resp.status === 401) {
    clearToken()
    const result = await resp.json().catch(() => ({ code: 401, message: '未登录或登录已过期' }))
    return { code: 401, message: result.message || '未登录或登录已过期', data: null as never }
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return { code: -1, message: '服务暂不可用，请稍后重试', data: null as never }
  }

  const result = await resp.json()
  if (result.code === 0 && result.data?.admin) {
    setCurrentAdmin(result.data.admin)
  }
  return result
}

// ========== 排课管理 ==========

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

// ========== 学员管理 ==========

// 删除学员及其所有排课/报名/结转
export async function deleteStudent(
  studentId: string,
): Promise<ApiResult<{ deletedScheduleFiles: number; studentRemoved: boolean }>> {
  return request(`${API_BASE}/student-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ studentId }),
  })
}

// 新增学员（id 由后端自动生成，前端无需传 id）
export async function addStudent(
  student: Omit<Student, 'id' | 'createdAt'> & { id?: string },
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

// 搜索学员（精确+模糊）
export async function searchStudents(
  q: string,
): Promise<ApiResult<{ students: Student[] }>> {
  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  const query = qs.toString()
  return request(`${API_BASE}/students${query ? '?' + query : ''}`, { method: 'GET' })
}

// ========== 课程管理 ==========

// 获取课程列表
export async function listCourses(): Promise<ApiResult<{ courses: Course[] }>> {
  return request(`${API_BASE}/courses`, { method: 'GET' })
}

// 新增课程（id 由后端自动生成，前端无需传 id）
export async function addCourse(
  course: Omit<Course, 'id' | 'createdAt'> & { id?: string },
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
  dates: string[]
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

// ========== 点名管理 ==========

export async function getAttendanceList(
  date: string,
): Promise<ApiResult<{ schedules: Schedule[]; total: number }>> {
  const qs = new URLSearchParams({ date })
  return request(`${API_BASE}/attendance?${qs}`, { method: 'GET' })
}

// 批量设置点名
export async function setAttendance(
  date: string,
  items: { scheduleId: string; studentId: string; attended: boolean }[],
): Promise<ApiResult<{ updatedSchedules: number; updatedEnrollments: number; errors: string[] }>> {
  return request(`${API_BASE}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ date, items }),
  })
}

// ========== 报名管理 ==========

export async function listEnrollments(params: {
  studentId?: string
  courseId?: string
  status?: 'active' | 'settled' | 'finished'
} = {}): Promise<ApiResult<{ enrollments: Enrollment[]; total: number }>> {
  const qs = new URLSearchParams()
  if (params.studentId) qs.set('studentId', params.studentId)
  if (params.courseId) qs.set('courseId', params.courseId)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  return request(`${API_BASE}/enrollments${query ? '?' + query : ''}`, { method: 'GET' })
}

// 新增报名
export async function addEnrollment(
  enrollment: Omit<Enrollment, 'id' | 'status' | 'remainingPaidHours' | 'remainingGiftHours' | 'totalAmount' | 'paidAmount' | 'enrolledAt' | 'createdAt'> & {
    id?: string
    totalAmount?: number
    paidAmount?: number
    enrolledAt?: string
    note?: string
  },
): Promise<ApiResult<{ created: boolean; exists: boolean; enrollment: Enrollment }>> {
  return request(`${API_BASE}/enrollment-add`, {
    method: 'POST',
    body: JSON.stringify({ enrollment }),
  })
}

// 更新报名（续费/补赠课/改价/改状态）
export async function updateEnrollment(
  enrollment: Partial<Enrollment> & { id: string },
): Promise<ApiResult<{
  updated: boolean
  notFound: boolean
  purchasedDelta: number
  giftDelta: number
}>> {
  return request(`${API_BASE}/enrollment-update`, {
    method: 'PUT',
    body: JSON.stringify({ enrollment }),
  })
}

export async function deleteEnrollment(
  id: string,
): Promise<ApiResult<{ deleted: boolean }>> {
  return request(`${API_BASE}/enrollment-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

// ========== 结转管理 ==========

export async function listTransfers(params: {
  studentId?: string
} = {}): Promise<ApiResult<{ transfers: Transfer[]; total: number }>> {
  const qs = new URLSearchParams()
  if (params.studentId) qs.set('studentId', params.studentId)
  const query = qs.toString()
  return request(`${API_BASE}/transfers${query ? '?' + query : ''}`, { method: 'GET' })
}

export async function addTransfer(transfer: {
  studentId: string
  fromEnrollmentId: string
  toEnrollmentId: string
  mode: 'amount' | 'hours'
  note?: string
  reason?: string
}): Promise<ApiResult<{
  created: boolean
  mode: string
  transferredHours: number
  transferredAmount: number
  leftoverAmount: number
  toPurchasedAdd: number
  toGiftAdd: number
}>> {
  return request(`${API_BASE}/transfer-add`, {
    method: 'POST',
    body: JSON.stringify({ transfer }),
  })
}

// ========== 管理员账号管理（RBAC） ==========

// 管理员列表（仅超管）
export async function listAdmins(): Promise<ApiResult<{ admins: AdminUser[] }>> {
  return request(`${API_BASE}/admins`, { method: 'GET' })
}

// 新增管理员（仅超管，role 仅允许 admin/teacher）
export async function addAdmin(admin: {
  username: string
  password: string
  role: Exclude<AdminRole, 'superadmin'>
  realName?: string
  phone?: string
  permissions?: string[]
}): Promise<ApiResult<{ admin: AdminUser }>> {
  return request(`${API_BASE}/admin-add`, {
    method: 'POST',
    body: JSON.stringify({ admin }),
  })
}

// 更新管理员（改角色/姓名/电话/状态/重置密码/权限）
export async function updateAdmin(admin: {
  id: string
  role?: AdminRole
  realName?: string
  phone?: string
  status?: 'active' | 'disabled'
  password?: string
  permissions?: string[]
}): Promise<ApiResult<null>> {
  return request(`${API_BASE}/admin-update`, {
    method: 'PUT',
    body: JSON.stringify({ admin }),
  })
}

// 查询权限定义矩阵（供权限分配表渲染）
export async function getPermissionDefinitions(): Promise<
  ApiResult<{ definitions: PermissionModule[]; rolePermissions: Record<string, string | string[]> }>
> {
  return request(`${API_BASE}/permission-definitions`, { method: 'GET' })
}

// 删除管理员（不可删自己、不可删最后一个超管）
export async function deleteAdmin(id: string): Promise<ApiResult<null>> {
  return request(`${API_BASE}/admin-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

// ========== 审计日志 ==========

export async function listAuditLogs(params: {
  actorId?: string
  module?: string
  targetType?: string
  targetId?: string
  action?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
} = {}): Promise<ApiResult<{
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
}>> {
  const qs = new URLSearchParams()
  if (params.actorId) qs.set('actorId', params.actorId)
  if (params.module) qs.set('module', params.module)
  if (params.targetType) qs.set('targetType', params.targetType)
  if (params.targetId) qs.set('targetId', params.targetId)
  if (params.action) qs.set('action', params.action)
  if (params.startDate) qs.set('startDate', params.startDate)
  if (params.endDate) qs.set('endDate', params.endDate)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  const query = qs.toString()
  return request(`${API_BASE}/audit-logs${query ? '?' + query : ''}`, { method: 'GET' })
}

// ========== 报表 ==========

// 通用报表查询（按类型 + 时间范围 + 分组维度）
export async function getReport(
  query: ReportQuery,
): Promise<ApiResult<{ rows: Record<string, unknown>[]; summary?: Record<string, number> }>> {
  const qs = new URLSearchParams()
  qs.set('type', query.type)
  if (query.startDate) qs.set('startDate', query.startDate)
  if (query.endDate) qs.set('endDate', query.endDate)
  if (query.groupBy) qs.set('groupBy', query.groupBy)
  return request(`${API_BASE}/reports?${qs.toString()}`, { method: 'GET' })
}

// ========== 系统配置（扩展） ==========

// 读取完整系统配置（appName + 预警阈值 + 备份保留天数 + 模块开关）
export async function getSystemConfig(): Promise<ApiResult<SystemConfigFull>> {
  return request<SystemConfigFull>(`${API_BASE}/config`)
}

// 更新系统配置（appName / renewalThreshold / backupKeepDays 任意子集）
export async function updateSystemConfig(
  patch: Partial<Pick<SystemConfigFull, 'appName' | 'renewalThreshold' | 'backupKeepDays'>>,
): Promise<ApiResult<Partial<SystemConfigFull>>> {
  const resp = await fetch(`${API_BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

// ========== 数据备份与恢复 ==========

export async function listBackups(): Promise<ApiResult<{ backups: BackupInfo[]; keepDays: number }>> {
  return request<{ backups: BackupInfo[]; keepDays: number }>(`${API_BASE}/backups`)
}

export async function createBackup(): Promise<ApiResult<BackupInfo>> {
  const resp = await fetch(`${API_BASE}/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(30000),
  })
  return resp.json()
}

export async function deleteBackup(filename: string): Promise<ApiResult<{ ok: boolean }>> {
  const resp = await fetch(`${API_BASE}/backups?filename=${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function restoreBackup(filename: string): Promise<ApiResult<{ ok: boolean; preSnapshot: string }>> {
  const resp = await fetch(`${API_BASE}/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ filename }),
    signal: AbortSignal.timeout(30000),
  })
  return resp.json()
}

// ========== 课时过期处理 ==========

export async function expireOverdue(): Promise<ApiResult<{ affected: number }>> {
  const resp = await fetch(`${API_BASE}/expire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(15000),
  })
  return resp.json()
}

// ========== 批量报名 ==========

export async function batchEnroll(
  courseId: string,
  items: BatchEnrollmentItem[],
): Promise<ApiResult<{ count: number; results: { studentId: string; enrollmentId: string; ok: boolean }[] }>> {
  const resp = await fetch(`${API_BASE}/enrollment-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ courseId, items }),
    signal: AbortSignal.timeout(15000),
  })
  return resp.json()
}

// ========== 课后反馈 ==========
export async function getFeedback(params?: {
  scheduleId?: string; teacherId?: string; studentId?: string; courseId?: string
}): Promise<Feedback[]> {
  const qs = new URLSearchParams()
  if (params?.scheduleId) qs.set('scheduleId', params.scheduleId)
  if (params?.teacherId) qs.set('teacherId', params.teacherId)
  if (params?.studentId) qs.set('studentId', params.studentId)
  if (params?.courseId) qs.set('courseId', params.courseId)
  const result = await request<Feedback[]>(`${API_BASE}/feedback?${qs.toString()}`)
  return result.data
}

export async function addFeedback(fb: Omit<Feedback, 'id' | 'createdAt'>): Promise<ApiResult<Feedback>> {
  const resp = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(fb),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function updateFeedback(id: string, patch: Partial<Feedback>): Promise<ApiResult<{ id: string }>> {
  const resp = await fetch(`${API_BASE}/feedback`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, ...patch }),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function deleteFeedback(id: string): Promise<ApiResult<{ ok: boolean }>> {
  const resp = await fetch(`${API_BASE}/feedback?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

// 教师绩效
export async function getTeacherPerformance(params?: {
  startDate?: string; endDate?: string
}): Promise<TeacherPerformance[]> {
  const qs = new URLSearchParams()
  if (params?.startDate) qs.set('startDate', params.startDate)
  if (params?.endDate) qs.set('endDate', params.endDate)
  const result = await request<TeacherPerformance[]>(`${API_BASE}/teacher-performance?${qs.toString()}`)
  return result.data
}

// ========== 优惠券 ==========
export async function getCoupons(status?: string): Promise<Coupon[]> {
  const qs = new URLSearchParams()
  if (status) qs.set('status', status)
  const result = await request<Coupon[]>(`${API_BASE}/coupons?${qs.toString()}`)
  return result.data
}

export async function addCoupon(coupon: Omit<Coupon, 'id' | 'createdAt' | 'usedCount'>): Promise<ApiResult<Coupon>> {
  const resp = await fetch(`${API_BASE}/coupons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(coupon),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function updateCoupon(id: string, patch: Partial<Coupon>): Promise<ApiResult<{ id: string }>> {
  const resp = await fetch(`${API_BASE}/coupons`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, ...patch }),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function deleteCoupon(id: string): Promise<ApiResult<{ ok: boolean }>> {
  const resp = await fetch(`${API_BASE}/coupons?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

// ========== 会员卡 ==========
export async function getMemberships(status?: string): Promise<Membership[]> {
  const qs = new URLSearchParams()
  if (status) qs.set('status', status)
  const result = await request<Membership[]>(`${API_BASE}/memberships?${qs.toString()}`)
  return result.data
}

export async function addMembership(m: Omit<Membership, 'id' | 'createdAt'>): Promise<ApiResult<Membership>> {
  const resp = await fetch(`${API_BASE}/memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(m),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function updateMembership(id: string, patch: Partial<Membership>): Promise<ApiResult<{ id: string }>> {
  const resp = await fetch(`${API_BASE}/memberships`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, ...patch }),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function deleteMembership(id: string): Promise<ApiResult<{ ok: boolean }>> {
  const resp = await fetch(`${API_BASE}/memberships?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function getStudentMemberships(studentId?: string): Promise<StudentMembership[]> {
  const qs = new URLSearchParams()
  if (studentId) qs.set('studentId', studentId)
  const result = await request<StudentMembership[]>(`${API_BASE}/student-memberships?${qs.toString()}`)
  return result.data
}

export async function addStudentMembership(sm: {
  studentId: string; membershipId: string; paidAmount?: number; durationDays?: number
}): Promise<ApiResult<{ id: string }>> {
  const resp = await fetch(`${API_BASE}/student-memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(sm),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function deleteStudentMembership(id: string): Promise<ApiResult<{ ok: boolean }>> {
  const resp = await fetch(`${API_BASE}/student-memberships?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

// ========== CRM 线索 ==========
export async function getLeads(params?: { stage?: string; assignedTo?: string }): Promise<Lead[]> {
  const qs = new URLSearchParams()
  if (params?.stage) qs.set('stage', params.stage)
  if (params?.assignedTo) qs.set('assignedTo', params.assignedTo)
  const result = await request<Lead[]>(`${API_BASE}/leads?${qs.toString()}`)
  return result.data
}

export async function addLead(lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'converted' | 'studentId'>): Promise<ApiResult<Lead>> {
  const resp = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<ApiResult<{ id: string }>> {
  const resp = await fetch(`${API_BASE}/leads`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, ...patch }),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function deleteLead(id: string): Promise<ApiResult<{ ok: boolean }>> {
  const resp = await fetch(`${API_BASE}/leads?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

export async function getFollowups(leadId: string): Promise<LeadFollowup[]> {
  const result = await request<LeadFollowup[]>(`${API_BASE}/followups?leadId=${encodeURIComponent(leadId)}`)
  return result.data
}

export async function addFollowup(fu: { leadId: string; content: string; stage?: string }): Promise<ApiResult<{ id: string }>> {
  const resp = await fetch(`${API_BASE}/followups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(fu),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

// ========== 家长端专属链接生成 ==========
// 为学员签发家长访问 token（手机号后4位二次校验）
export async function generateShareLink(
  studentId: string,
): Promise<ApiResult<{ token: string; studentId: string; studentName: string }>> {
  const resp = await fetch(`${API_BASE}/share-link-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ studentId }),
    signal: AbortSignal.timeout(10000),
  })
  return resp.json()
}

// ========== 智能排课冲突检测 ==========
export interface ScheduleConflict {
  type: 'teacher' | 'student' | 'location'
  field: string
  value: string
  schedule: Schedule
}
export interface ConflictCheckResult {
  date: string
  conflicts: ScheduleConflict[]
}

export async function checkScheduleConflict(params: {
  studentId?: string
  teacher?: string
  location?: string
  dates: string[]
  startTime: string
  endTime: string
}): Promise<ApiResult<{ results: ConflictCheckResult[]; total: number; free: number; conflict: number }>> {
  return request(`${API_BASE}/schedule-check-conflict`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}
