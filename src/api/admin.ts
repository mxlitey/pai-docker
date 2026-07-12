// 后台管理 API 调用层 —— 直接请求后端 Edge Functions
// 所有管理类请求需携带登录 token（Authorization: Bearer <token>）
import type {
  Schedule, Student, Course, Enrollment, Transfer,
  AdminUser, AdminRole, CurrentAdmin, AuditLog, ReportQuery,
  BackupInfo, SystemConfigFull,
  Feedback, TeacherPerformance,
  PermissionModule, Grade, ClassInfo, ClassMember,
  ScheduleChange, AccountTransaction,
  AuditArchiveInfo, AuditArchiveContent,
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
// 系统未初始化时后端返回 bootstrap=true，前端据此跳转引导页
export async function login(
  username: string,
  password: string,
): Promise<ApiResult<{ token: string; admin: CurrentAdmin }> & { bootstrap?: boolean }> {
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

// 调课：原排课标记 cancelled + 新排课插入 + 写入调课记录
// 插班字段（newTeacher/newCourseId/newCourseName/newClassId/newLocation）可选，传则覆盖原排课对应字段
export async function rescheduleSchedule(
  scheduleId: string,
  newDate: string,
  newStartTime?: string,
  newEndTime?: string,
  reason?: string,
  insertOpts?: {
    newTeacher?: string
    newCourseId?: string
    newCourseName?: string
    newClassId?: string
    newLocation?: string
    newColor?: string
  },
): Promise<ApiResult<{ changeId: string; originalScheduleId: string; newScheduleId: string }>> {
  return request(`${API_BASE}/schedule-reschedule`, {
    method: 'POST',
    body: JSON.stringify({
      scheduleId, newDate, newStartTime, newEndTime, reason,
      ...insertOpts,
    }),
  })
}

// 补课：保留原缺勤排课 + 生成新排课（设 makeup_for）
// 插班字段（newTeacher/newCourseId/newCourseName/newClassId/newLocation）可选，传则覆盖原排课对应字段
export async function makeupSchedule(
  scheduleId: string,
  newDate: string,
  newStartTime?: string,
  newEndTime?: string,
  reason?: string,
  insertOpts?: {
    newTeacher?: string
    newCourseId?: string
    newCourseName?: string
    newClassId?: string
    newLocation?: string
    newColor?: string
  },
): Promise<ApiResult<{ originalScheduleId: string; newScheduleId: string }>> {
  return request(`${API_BASE}/schedule-makeup`, {
    method: 'POST',
    body: JSON.stringify({
      scheduleId, newDate, newStartTime, newEndTime, reason,
      ...insertOpts,
    }),
  })
}

// 查询调课历史（按排课ID或学员ID）
export async function listScheduleChanges(
  params: { scheduleId?: string; studentId?: string; limit?: number },
): Promise<ApiResult<{ changes: ScheduleChange[]; total: number }>> {
  const qs = new URLSearchParams()
  if (params.scheduleId) qs.set('scheduleId', params.scheduleId)
  if (params.studentId) qs.set('studentId', params.studentId)
  if (params.limit) qs.set('limit', String(params.limit))
  return request(`${API_BASE}/schedule-changes?${qs.toString()}`, {
    method: 'GET',
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

// ========== 年级管理 ==========

// 获取年级列表（按 sort_order 排序）
export async function listGrades(): Promise<ApiResult<{ grades: Grade[] }>> {
  return request(`${API_BASE}/grades`, { method: 'GET' })
}

// 新增年级
export async function addGrade(
  grade: Omit<Grade, 'id' | 'createdAt'> & { id?: string },
): Promise<ApiResult<{ created: boolean; exists: boolean; duplicateName: boolean; grade: Grade }>> {
  return request(`${API_BASE}/grade-add`, {
    method: 'POST',
    body: JSON.stringify({ grade }),
  })
}

// 更新年级（重命名时后端级联更新学员/课程的 grade 文本字段）
export async function updateGrade(
  grade: Grade,
): Promise<ApiResult<{ updated: boolean; notFound: boolean; duplicateName: boolean; renamed: boolean; grade: Grade }>> {
  return request(`${API_BASE}/grade-update`, {
    method: 'PUT',
    body: JSON.stringify({ grade }),
  })
}

// 删除年级（仍被学员/课程引用时后端拒绝，返回 inUse + 计数）
export async function deleteGrade(
  id: string,
): Promise<ApiResult<{ deleted: boolean; notFound: boolean; inUse: boolean; studentCount: number; courseCount: number }>> {
  return request(`${API_BASE}/grade-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

// 批量升班：将 fromGradeName 年级的所有学员升至 toGradeName
export async function promoteGrade(
  fromGradeName: string,
  toGradeName: string,
): Promise<ApiResult<{ promoted: number; same: boolean; fromGradeName: string; toGradeName: string }>> {
  return request(`${API_BASE}/grade-promote`, {
    method: 'POST',
    body: JSON.stringify({ fromGradeName, toGradeName }),
  })
}

// ========== 班级管理 ==========

// 获取班级列表（带成员数 + 关联课程名）
export async function listClasses(params: { courseId?: string; status?: string } = {}): Promise<ApiResult<{ classes: ClassInfo[] }>> {
  const qs = new URLSearchParams()
  if (params.courseId) qs.set('courseId', params.courseId)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  return request(`${API_BASE}/classes${query ? '?' + query : ''}`, { method: 'GET' })
}

// 新增班级（id 由后端自动生成）
export async function addClass(
  cls: Omit<ClassInfo, 'id' | 'createdAt' | 'memberCount' | 'courseName'> & { id?: string },
): Promise<ApiResult<{ created: boolean; exists: boolean; class: ClassInfo }>> {
  return request(`${API_BASE}/class-add`, {
    method: 'POST',
    body: JSON.stringify({ class: cls }),
  })
}

// 更新班级
export async function updateClass(
  cls: Partial<ClassInfo> & { id: string; name: string },
): Promise<ApiResult<{ updated: boolean; notFound: boolean; class: ClassInfo }>> {
  return request(`${API_BASE}/class-update`, {
    method: 'PUT',
    body: JSON.stringify({ class: cls }),
  })
}

// 删除班级（仍有排课引用时后端拒绝，返回 inUse + scheduleCount）
export async function deleteClass(
  id: string,
): Promise<ApiResult<{ deleted: boolean; notFound: boolean; inUse: boolean; scheduleCount: number }>> {
  return request(`${API_BASE}/class-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

// 查询班级成员名单
export async function getClassMembers(classId: string): Promise<ApiResult<{ members: ClassMember[] }>> {
  const qs = new URLSearchParams({ classId })
  return request(`${API_BASE}/class-members?${qs.toString()}`, { method: 'GET' })
}

// 批量加班级成员（忽略已存在）
export async function addClassMembers(
  classId: string,
  studentIds: string[],
): Promise<ApiResult<{ added: number }>> {
  return request(`${API_BASE}/class-members`, {
    method: 'POST',
    body: JSON.stringify({ classId, studentIds }),
  })
}

// 批量移除班级成员
export async function removeClassMembers(
  classId: string,
  studentIds: string[],
): Promise<ApiResult<{ removed: number }>> {
  return request(`${API_BASE}/class-members`, {
    method: 'DELETE',
    body: JSON.stringify({ classId, studentIds }),
  })
}

// 批量新增排课（按课程/班级为多个学员在多个日期同时排课）
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
  classId?: string
  makeupFor?: string
}): Promise<ApiResult<{ created: number; skipped: number; errors: string[]; totalAttempts?: number }>> {
  return request(`${API_BASE}/schedule-add-batch`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// 跨学员搜索排课：按日期范围 + 可选课程 ID / 班级 ID 过滤
export async function searchSchedules(params: {
  startDate?: string
  endDate?: string
  courseId?: string
  grade?: string
  classId?: string
}): Promise<ApiResult<{ schedules: Schedule[]; total: number }>> {
  const qs = new URLSearchParams()
  if (params.startDate) qs.set('startDate', params.startDate)
  if (params.endDate) qs.set('endDate', params.endDate)
  if (params.courseId) qs.set('courseId', params.courseId)
  if (params.grade) qs.set('grade', params.grade)
  if (params.classId) qs.set('classId', params.classId)
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
  status?: 'active' | 'settled' | 'expired'
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
    useBalance?: boolean
    enrolledAt?: string
    note?: string
  },
): Promise<ApiResult<{ created: boolean; exists: boolean; balanceDeduct?: number; balanceAfter?: number; cashPaid?: number; enrollment: Enrollment }>> {
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

// ========== 退课/结转管理 ==========

export async function listTransfers(params: {
  studentId?: string
} = {}): Promise<ApiResult<{ transfers: Transfer[]; total: number }>> {
  const qs = new URLSearchParams()
  if (params.studentId) qs.set('studentId', params.studentId)
  const query = qs.toString()
  return request(`${API_BASE}/transfers${query ? '?' + query : ''}`, { method: 'GET' })
}

// 退课：源报名剩余课时折算成金额，存入学员账户余额
export async function addTransfer(transfer: {
  studentId: string
  fromEnrollmentId: string
  giftMode?: 'discard' | 'refund'
  note?: string
  reason?: string
}): Promise<ApiResult<{
  created: boolean
  refundAmount: number
  refundHours: number
  giftMode: string
  balanceAfter: number
}>> {
  return request(`${API_BASE}/transfer-add`, {
    method: 'POST',
    body: JSON.stringify({ transfer }),
  })
}

// ========== 账户管理 ==========

export async function listAccountTransactions(params: {
  studentId?: string
} = {}): Promise<ApiResult<{ transactions: AccountTransaction[] }>> {
  const qs = new URLSearchParams()
  if (params.studentId) qs.set('studentId', params.studentId)
  const query = qs.toString()
  return request(`${API_BASE}/account-transactions${query ? '?' + query : ''}`, { method: 'GET' })
}

// ========== 账号中心管理（RBAC） ==========

// 账号列表（仅超管）
export async function listAdmins(): Promise<ApiResult<{ admins: AdminUser[] }>> {
  return request(`${API_BASE}/admins`, { method: 'GET' })
}

// 新增账户（仅超管，role 仅允许 admin/teacher）
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

// 删除账户（不可删自己、不可删最后一个超管）
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

// ========== 审计日志归档 ==========

// 列出所有已归档月份
export async function listAuditArchives(): Promise<ApiResult<{ archives: AuditArchiveInfo[] }>> {
  return request(`${API_BASE}/audit-archives`, { method: 'GET' })
}

// 查看指定月份归档内容
export async function readAuditArchive(month: string): Promise<ApiResult<AuditArchiveContent>> {
  const qs = new URLSearchParams({ month })
  return request(`${API_BASE}/audit-archives?${qs.toString()}`, { method: 'GET' })
}

// 手动触发归档指定月份
export async function createAuditArchive(
  month: string,
): Promise<ApiResult<{ archived: number; filename: string; size: number }>> {
  return request(`${API_BASE}/audit-archives`, {
    method: 'POST',
    body: JSON.stringify({ month }),
  })
}

// 删除指定月份归档
export async function deleteAuditArchive(month: string): Promise<ApiResult<{ deleted: boolean }>> {
  const qs = new URLSearchParams({ month })
  return request(`${API_BASE}/audit-archives?${qs.toString()}`, { method: 'DELETE' })
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
// 需 settings:manage 权限，备份策略等运维字段不对外公开
export async function getSystemConfig(): Promise<ApiResult<SystemConfigFull>> {
  return request<SystemConfigFull>(`${API_BASE}/config?full=1`)
}

// 更新系统配置（appName / renewalThreshold / backupKeepDays / backupCron / backupMaxCount 任意子集）
export async function updateSystemConfig(
  patch: Partial<Pick<SystemConfigFull, 'appName' | 'renewalThreshold' | 'backupKeepDays' | 'backupCron' | 'backupMaxCount'>>,
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

// 教师绩效（支持按 teacher 教师姓名过滤，仅显示该教师本人绩效）
export async function getTeacherPerformance(params?: {
  startDate?: string; endDate?: string; teacher?: string
}): Promise<TeacherPerformance[]> {
  const qs = new URLSearchParams()
  if (params?.startDate) qs.set('startDate', params.startDate)
  if (params?.endDate) qs.set('endDate', params.endDate)
  if (params?.teacher) qs.set('teacher', params.teacher)
  const result = await request<TeacherPerformance[]>(`${API_BASE}/teacher-performance?${qs.toString()}`)
  return result.data || []
}
