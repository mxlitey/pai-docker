// 计费方式
export type BillingType = 'per_lesson' | 'per_term' | 'per_month'

// 报名记录状态
export type EnrollmentStatus = 'active' | 'settled' | 'finished'

// 结转方式
export type TransferMode = 'amount' | 'hours'

// 管理员角色
export type AdminRole = 'superadmin' | 'admin' | 'teacher'

// 学员状态
export type StudentStatus = 'active' | 'inactive' | 'graduated'

// 课程状态
export type CourseStatus = 'active' | 'inactive'

// 排课状态
export type ScheduleStatus = 'scheduled' | 'completed' | 'cancelled' | 'makeup'

// 学员信息
export interface Student {
  id: string
  name: string
  grade?: string
  phone?: string
  parentName?: string
  gender?: string
  birthday?: string
  status?: StudentStatus
  tags?: string
  remark?: string
  source?: string
  createdAt?: string
}

// 课程信息
export interface Course {
  id: string
  name: string
  teacher?: string
  location?: string
  color?: string
  defaultStartTime?: string
  defaultEndTime?: string
  unitPrice?: number
  billingType?: BillingType
  capacity?: number
  term?: string
  status?: CourseStatus
  category?: string
  description?: string
  createdAt?: string
}

// 排课记录
export interface Schedule {
  id: string
  studentId: string
  studentName: string
  courseId?: string
  courseName: string
  teacher: string
  location: string
  date: string
  startTime: string
  endTime: string
  note?: string
  color?: string
  attended?: boolean
  status?: ScheduleStatus
  room?: string
  makeupFor?: string
}

// 报名记录（计费核心）
export interface Enrollment {
  id: string
  studentId: string
  courseId: string
  status: EnrollmentStatus
  purchasedHours: number
  giftHours: number
  remainingPaidHours: number
  remainingGiftHours: number
  unitPrice: number
  totalAmount: number
  paidAmount: number
  discountAmount?: number
  channel?: string
  salesId?: string
  paymentMethod?: string
  paymentStatus?: string
  contractNo?: string
  expiredAt?: string
  operatorId?: string
  enrolledAt: string
  note?: string
  createdAt?: string
}

// 结转流水
export interface Transfer {
  id: string
  studentId: string
  fromEnrollmentId: string
  toEnrollmentId: string
  mode: TransferMode
  transferredHours: number
  transferredAmount: number
  leftoverAmount: number
  fromUnitPrice: number
  toUnitPrice: number
  operatorId?: string
  reason?: string
  note?: string
  createdAt?: string
}

// 管理员账号
export interface AdminUser {
  id: string
  username: string
  role: AdminRole
  realName?: string
  phone?: string
  status?: 'active' | 'disabled'
  teacherId?: string
  // 自定义权限点（逗号分隔串，非空时覆盖角色默认权限；空串表示用角色默认）
  permissions?: string
  lastLoginAt?: string
  lastLoginIp?: string
  createdAt?: string
  createdBy?: string
}

// 当前登录用户信息（token 校验返回）
export interface CurrentAdmin {
  id: string
  username: string
  role: AdminRole
  realName?: string
  // 自定义权限点（逗号分隔串）
  permissions?: string
}

// 权限定义（供前端渲染权限矩阵）
export interface PermissionAction {
  key: string
  label: string
}
export interface PermissionModule {
  module: string
  label: string
  actions: PermissionAction[]
}

// 审计日志
export interface AuditLog {
  id: string
  actorId: string
  actorName: string
  actorRole: AdminRole | string
  action: string
  module: string
  targetType?: string
  targetId?: string
  targetName?: string
  summary?: string
  before?: unknown
  after?: unknown
  ip?: string
  userAgent?: string
  createdAt?: string
}

// 学员报名汇总（前端展示用）
export interface EnrollmentSummary {
  count: number
  purchasedHours: number
  giftHours: number
  remainingHours: number
  remainingPaidHours: number
  remainingGiftHours: number
  totalAmount: number
  paidAmount: number
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

// 报表类型
export type ReportType =
  | 'revenue'
  | 'hours-consumption'
  | 'hours-balance'
  | 'attendance-rate'
  | 'transfers'
  | 'enrollment-stats'

// 报表查询参数
export interface ReportQuery {
  type: ReportType
  startDate?: string
  endDate?: string
  groupBy?: 'day' | 'month' | 'course' | 'teacher'
}

// ========== 数据备份 ==========
export interface BackupInfo {
  filename: string
  path: string
  size: number
  createdAt: string
}

// 系统配置（含续费预警阈值、备份保留天数等）
export interface SystemConfigFull {
  appName: string
  renewalThreshold: number
  backupKeepDays: number
  moduleEnabled: Record<string, boolean>
}

// 批量报名条目
export interface BatchEnrollmentItem {
  studentId: string
  purchasedHours: number
  giftHours?: number
  unitPrice?: number
  paidAmount?: number
}

// ========== 课后反馈 ==========
export interface Feedback {
  id: string
  scheduleId: string
  courseId: string
  teacherId: string
  teacherName: string
  studentId: string
  studentName: string
  date: string
  content: string
  rating: number
  createdAt: string
}

// 教师绩效
export interface TeacherPerformance {
  teacher_id: string
  teacher_name: string
  schedule_count: number
  attended_count: number
  avg_rating: number | null
  feedback_count: number
}

// ========== 优惠券 ==========
export interface Coupon {
  id: string
  code: string
  name: string
  type: 'discount' | 'amount' // discount=折扣（value=百分比），amount=满减（value=金额）
  value: number
  minAmount: number
  validFrom: string
  validTo: string
  usageLimit: number
  usedCount: number
  status: 'active' | 'disabled'
  remark: string
  createdAt: string
}

// ========== 会员卡 ==========
export interface Membership {
  id: string
  name: string
  type: 'monthly' | 'termly' | 'yearly' | 'count'
  durationDays: number
  price: number
  status: 'active' | 'disabled'
  benefits: string
  remark: string
  createdAt: string
}

export interface StudentMembership {
  id: string
  studentId: string
  studentName: string
  membershipId: string
  membershipName: string
  membershipType: string
  status: 'active' | 'expired'
  startedAt: string
  expiredAt: string
  paidAmount: number
  createdAt: string
}

// ========== CRM 线索 ==========
export type LeadStage = 'new' | 'contacted' | 'trial' | 'intentioned' | 'signed' | 'lost'

export interface Lead {
  id: string
  name: string
  phone: string
  grade: string
  source: string
  stage: LeadStage
  intention: string
  assignedTo: string
  remark: string
  converted: boolean
  studentId: string
  createdAt: string
  updatedAt: string
}

export interface LeadFollowup {
  id: string
  leadId: string
  content: string
  stage: string
  operatorId: string
  createdAt: string
}

