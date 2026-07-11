import { useState, useEffect, useCallback } from 'react'
import type { Student, Course, EnrollmentSummary, Grade } from '@/types'
import { searchStudents, getAnnouncement } from '@/api'
import {
  verifyAuth,
  saveAnnouncement,
  getAttendanceList,
  setAttendance,
  deleteStudent,
  addStudent,
  updateStudent,
  listCourses,
  addCourse,
  updateCourse,
  deleteCourse,
  listEnrollments,
  listGrades,
  getToken,
  clearToken,
  getBootstrapStatus,
  getCurrentAdmin,
} from '@/api/admin'
import { canSeeModule } from '@/utils/permission'
import { AnnouncementAdmin } from './AnnouncementAdmin'
import { ShareLinksAdmin } from './ShareLinksAdmin'
import { StudentAdmin } from './StudentAdmin'
import { GradeAdmin } from './GradeAdmin'
import { ClassesAdmin } from './ClassesAdmin'
import { CourseAdmin } from './CourseAdmin'
import { ScheduleAdmin } from './ScheduleAdmin'
import { AttendanceAdmin } from './AttendanceAdmin'
import { EnrollmentAdmin } from './EnrollmentAdmin'
import { TransferAdmin } from './TransferAdmin'
import { SystemSettingsAdmin } from './SystemSettingsAdmin'
import { AdminUserAdmin } from './AdminUserAdmin'
import { AuditLogAdmin } from './AuditLogAdmin'
import { ReportsAdmin } from './ReportsAdmin'
import { TeacherAdmin } from './TeacherAdmin'
import { AdminLogin } from './AdminLogin'
import { Bootstrap } from './Bootstrap'
import { toast, confirmDialog } from '@/components/ui'

interface AdminPanelProps {
  onExit: () => void
}

// 后台子页面类型：null 表示后台主页，其他值表示对应二级页面
type SubPage =
  | 'students'
  | 'grades'
  | 'classes'
  | 'courses'
  | 'enrollments'
  | 'transfers'
  | 'schedules'
  | 'attendance'
  | 'announcement'
  | 'shareLinks'
  | 'settings'
  | 'admins'
  | 'auditLogs'
  | 'reports'
  | 'teachers'
  | null

// 从 URL hash 解析当前子页面：#admin/students → 'students'
function readSubPageFromHash(): SubPage {
  try {
    const hash = window.location.hash
    if (!hash.startsWith('#admin')) return null
    const parts = hash.split('/')
    const sub = parts[1]
    if (!sub) return null
    const valid: SubPage[] = [
      'students',
      'grades',
      'classes',
      'courses',
      'enrollments',
      'transfers',
      'schedules',
      'attendance',
      'announcement',
      'shareLinks',
      'settings',
      'admins',
      'auditLogs',
      'reports',
      'teachers',
    ]
    return valid.includes(sub as SubPage) ? (sub as SubPage) : null
  } catch {
    return null
  }
}

// 写入子页面到 URL hash：#admin 或 #admin/students
function writeSubPageToHash(sub: SubPage) {
  try {
    const url = new URL(window.location.href)
    url.hash = sub ? `admin/${sub}` : 'admin'
    window.history.replaceState({}, '', url.toString())
  } catch {
    // 忽略
  }
}

export function AdminPanel({ onExit }: AdminPanelProps) {
  // 启动流程：先检查 bootstrap 状态，再校验 token
  // bootstrap=true → 渲染引导页；bootstrap=false → 检查 token 决定登录/已登录
  const [bootstrap, setBootstrap] = useState<boolean | null>(null) // null=检查中
  const [authed, setAuthed] = useState<boolean>(false)
  const [checking, setChecking] = useState<boolean>(true)
  const [students, setStudents] = useState<Student[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  // 学员报名汇总：studentId -> 汇总（从全部 active enrollment 聚合）
  const [enrollmentSummaries, setEnrollmentSummaries] = useState<Record<string, EnrollmentSummary>>({})

  // 操作状态
  const [busy, setBusy] = useState(false)

  // 公告设置（公告管理页编辑 + 保存）
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementUpdatedAt, setAnnouncementUpdatedAt] = useState('')

  // 当前激活的二级页面：初始值从 URL hash 恢复，避免刷新时丢失
  const [activeSubPage, setActiveSubPage] = useState<SubPage>(() =>
    readSubPageFromHash(),
  )
  // 主页分类选项卡：基础教务 / 教学运营 / 报表中心 / 系统管理
  const [activeTab, setActiveTab] = useState<'basic' | 'operation' | 'data' | 'system'>('basic')
  // 当前登录用户（用于按权限隐藏模块入口）
  const currentAdmin = getCurrentAdmin()

  // 切换子页面：同时更新 URL hash
  const goSubPage = (sub: SubPage) => {
    setActiveSubPage(sub)
    writeSubPageToHash(sub)
  }

  // 兼容旧子组件 props：转发到全局命令式 toast
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    toast[type](message)
  }

  // 统一错误处理：401 时清除 token 并回到登录页
  const handleApiError = (e: Error) => {
    const msg = e.message || ''
    if (msg.includes('未登录') || msg.includes('登录已过期') || msg.includes('401')) {
      clearToken()
      setAuthed(false)
    }
    toast.error(msg.includes('请求失败') ? msg : '请求失败' + '：' + msg)
  }

  // 加载学员列表（后台默认展示全部）
  const loadStudents = useCallback(async () => {
    try {
      const list = await searchStudents('')
      setStudents(list)
    } catch (e) {
      showToast('error', '加载学员列表失败：' + (e as Error).message)
    }
  }, [])

  // 加载课程列表
  const loadCourses = useCallback(async () => {
    try {
      const result = await listCourses()
      if (result.code === 0) {
        setCourses(result.data.courses)
      }
    } catch (e) {
      // 课程加载失败不阻塞主流程
      console.error('加载课程列表失败:', e)
    }
  }, [])

  // 加载年级列表（学员/课程/报名/结转页均需按年级选择或过滤）
  const loadGrades = useCallback(async () => {
    try {
      const result = await listGrades()
      if (result.code === 0) {
        setGrades(result.data.grades)
      }
    } catch (e) {
      console.error('加载年级列表失败:', e)
    }
  }, [])

  // 加载全部报名记录并聚合为「学员 -> 报名汇总」映射，供学员管理页展示
  const loadEnrollmentSummaries = useCallback(async () => {
    try {
      const result = await listEnrollments({ status: 'active' })
      if (result.code !== 0) return
      const map: Record<string, EnrollmentSummary> = {}
      for (const e of result.data.enrollments) {
        let s = map[e.studentId]
        if (!s) {
          s = {
            count: 0,
            purchasedHours: 0,
            giftHours: 0,
            remainingHours: 0,
            remainingPaidHours: 0,
            remainingGiftHours: 0,
            totalAmount: 0,
            paidAmount: 0,
          }
          map[e.studentId] = s
        }
        s.count += 1
        s.purchasedHours += e.purchasedHours
        s.giftHours += e.giftHours
        s.remainingPaidHours += e.remainingPaidHours
        s.remainingGiftHours += e.remainingGiftHours
        s.remainingHours = s.remainingPaidHours + s.remainingGiftHours
        s.totalAmount += e.totalAmount
        s.paidAmount += e.paidAmount
      }
      setEnrollmentSummaries(map)
    } catch (e) {
      console.error('加载报名汇总失败:', e)
    }
  }, [])

  // 启动检查流程：
  // 1. 查询 bootstrap 状态
  // 2. 若处于引导模式 → 渲染引导页（不再检查 token）
  // 3. 否则校验 token：有效则直接进入后台，无效则展示登录页
  useEffect(() => {
    let cancelled = false
    async function checkEntry() {
      // 第一步：查询引导状态
      const { bootstrap: bs } = await getBootstrapStatus()
      if (cancelled) return
      if (bs) {
        setBootstrap(true)
        setChecking(false)
        return
      }
      setBootstrap(false)

      // 第二步：非引导模式，校验 token
      if (!getToken()) {
        setChecking(false)
        setAuthed(false)
        return
      }
      try {
        const result = await verifyAuth()
        if (cancelled) return
        if (result.code === 0) {
          setAuthed(true)
        } else {
          setAuthed(false)
        }
      } catch {
        if (!cancelled) setAuthed(false)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    checkEntry()
    return () => {
      cancelled = true
    }
  }, [])

  // 引导创建成功后：切换到登录页
  const handleBootstrapSuccess = () => {
    setBootstrap(false)
    setAuthed(false)
  }

  // 鉴权通过后再加载数据
  useEffect(() => {
    if (!authed) return
    loadStudents()
    loadCourses()
    loadGrades()
    loadEnrollmentSummaries()
  }, [authed, loadStudents, loadCourses, loadGrades, loadEnrollmentSummaries])

  // 公告：进入公告管理页时加载当前内容
  const handleLoadAnnouncement = useCallback(async () => {
    try {
      const info = await getAnnouncement()
      setAnnouncementText(info.content)
      setAnnouncementUpdatedAt(info.updatedAt)
    } catch {
      // 加载失败不阻塞，保留空内容供管理员写入
    }
  }, [])

  // 公告：保存
  const handleSaveAnnouncement = async () => {
    setBusy(true)
    try {
      const result = await saveAnnouncement(announcementText)
      if (result.code === 0) {
        setAnnouncementUpdatedAt(result.data.updatedAt)
        showToast('success', '公告已保存')
      } else {
        showToast('error', result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  // 删除学员及其所有排课
  const handleDeleteStudent = async (student: Student) => {
    const ok = await confirmDialog({
      title: '删除学员',
      message: `确认删除学员「${student.name}」(${student.id})？该操作将同时删除该学员的所有排课数据，且不可恢复。`,
      danger: true,
      requireText: student.name,
      confirmText: '确认删除',
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await deleteStudent(student.id)
      if (result.code === 0) {
        const msg = result.data.studentRemoved
          ? `已删除学员及 ${result.data.deletedScheduleFiles} 个排课文件`
          : '学员不存在（已清理残留排课文件）'
        toast.success(msg)
        await loadStudents()
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  // 新增学员
  // 返回 true 表示新增成功（弹窗可关闭），false 表示失败（保持弹窗）
  const handleAddStudent = async (student: Student): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await addStudent(student)
      if (result.code === 0) {
        showToast('success', `学员「${student.name}」已新增`)
        await loadStudents()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 更新学员（若姓名变更，后端会级联更新排课中的 studentName）
  const handleUpdateStudent = async (student: Student): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await updateStudent(student)
      if (result.code === 0) {
        showToast('success', result.message)
        await loadStudents()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 新增课程
  const handleAddCourse = async (course: Course): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await addCourse(course)
      if (result.code === 0) {
        showToast('success', `课程「${course.name}」已新增`)
        await loadCourses()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 更新课程
  const handleUpdateCourse = async (course: Course): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await updateCourse(course)
      if (result.code === 0) {
        showToast('success', `课程「${course.name}」已更新`)
        await loadCourses()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 删除课程（同时删除关联排课）
  const handleDeleteCourse = async (course: Course) => {
    const ok = await confirmDialog({
      title: '删除课程',
      message: `确认删除课程「${course.name}」(${course.id})？该操作将同时删除该课程的所有关联排课记录，且不可恢复。`,
      danger: true,
      requireText: course.name,
      confirmText: '确认删除',
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await deleteCourse(course.id)
      if (result.code === 0) {
        const msg = result.data.courseRemoved
          ? `已删除课程及 ${result.data.deletedScheduleCount} 条关联排课`
          : '课程不存在'
        toast.success(msg)
        await loadCourses()
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  // 校验中：显示加载状态
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <svg className="animate-spin w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {'加载中…'}
        </div>
      </div>
    )
  }

  // 引导模式：系统未初始化，渲染超管账号创建页
  if (bootstrap) {
    return (
      <Bootstrap onSuccess={handleBootstrapSuccess} onExit={onExit} />
    )
  }

  // 未登录：渲染登录页
  if (!authed) {
    return (
      <AdminLogin
        onSuccess={() => setAuthed(true)}
        onExit={onExit}
      />
    )
  }

  // 公告管理二级页面
  if (activeSubPage === 'announcement') {
    return (
      <>
        <AnnouncementAdmin
          onBack={() => goSubPage(null)}
          busy={busy}
          announcementText={announcementText}
          setAnnouncementText={setAnnouncementText}
          announcementUpdatedAt={announcementUpdatedAt}
          onSaveAnnouncement={handleSaveAnnouncement}
        />
      </>
    )
  }

  // 分享链接二级页面
  if (activeSubPage === 'shareLinks') {
    return (
      <>
        <ShareLinksAdmin
          students={students}
          onBack={() => goSubPage(null)}
        />
      </>
    )
  }

  // 系统设置二级页面
  if (activeSubPage === 'settings') {
    return (
      <>
        <SystemSettingsAdmin
          onBack={() => goSubPage(null)}
          busy={busy}
          setBusy={setBusy}
          showToast={showToast}
        />
      </>
    )
  }

  // 学员管理二级页面
  if (activeSubPage === 'students') {
    return (
      <>
        <StudentAdmin
          students={students}
          grades={grades}
          summaries={enrollmentSummaries}
          busy={busy}
          onBack={() => goSubPage(null)}
          onDelete={handleDeleteStudent}
          onAdd={handleAddStudent}
          onUpdate={handleUpdateStudent}
          onGradesChange={loadGrades}
        />
      </>
    )
  }

  // 年级管理二级页面
  if (activeSubPage === 'grades') {
    return (
      <>
        <GradeAdmin
          grades={grades}
          students={students}
          courses={courses}
          busy={busy}
          onBack={() => goSubPage(null)}
          onGradesChange={loadGrades}
          onStudentsChange={loadStudents}
          showToast={showToast}
        />
      </>
    )
  }

  // 班级管理二级页面
  if (activeSubPage === 'classes') {
    return (
      <>
        <ClassesAdmin
          courses={courses}
          grades={grades}
          students={students}
          busy={busy}
          onBack={() => goSubPage(null)}
          showToast={showToast}
        />
      </>
    )
  }

  // 课程管理二级页面
  if (activeSubPage === 'courses') {
    return (
      <>
        <CourseAdmin
          courses={courses}
          grades={grades}
          busy={busy}
          onBack={() => goSubPage(null)}
          onDelete={handleDeleteCourse}
          onAdd={handleAddCourse}
          onUpdate={handleUpdateCourse}
        />
      </>
    )
  }

  // 报名管理二级页面
  if (activeSubPage === 'enrollments') {
    return (
      <>
        <EnrollmentAdmin
          students={students}
          courses={courses}
          busy={busy}
          onBack={() => goSubPage(null)}
          showToast={showToast}
          onAuthError={handleApiError}
          onStudentsChanged={loadStudents}
        />
      </>
    )
  }

  // 结转退课二级页面
  if (activeSubPage === 'transfers') {
    return (
      <>
        <TransferAdmin
          students={students}
          busy={busy}
          onBack={() => goSubPage(null)}
          showToast={showToast}
          onAuthError={handleApiError}
          onStudentsChanged={loadStudents}
        />
      </>
    )
  }

  // 排课管理二级页面
  if (activeSubPage === 'schedules') {
    return (
      <>
        <ScheduleAdmin
          students={students}
          courses={courses}
          grades={grades}
          onBack={() => goSubPage(null)}
          onToast={showToast}
          currentAdmin={currentAdmin}
        />
      </>
    )
  }

  // 点名管理二级页面
  if (activeSubPage === 'attendance') {
    return (
      <>
        <AttendanceAdmin
          busy={busy}
          onBack={() => goSubPage(null)}
          onLoad={async (d) => {
            const r = await getAttendanceList(d)
            if (r.code !== 0) throw new Error(r.message)
            return r.data
          }}
          onSave={async (d, items) => {
            const r = await setAttendance(d, items)
            if (r.code !== 0) throw new Error(r.message)
            // 保存后刷新报名汇总（剩余课时已按报名记录扣减）
            await loadEnrollmentSummaries()
            return r.data
          }}
        />
      </>
    )
  }

  // 管理员账号管理二级页面（仅超管）
  if (activeSubPage === 'admins') {
    return <AdminUserAdmin onBack={() => goSubPage(null)} />
  }

  // 审计日志二级页面（仅超管）
  if (activeSubPage === 'auditLogs') {
    return <AuditLogAdmin onBack={() => goSubPage(null)} />
  }

  // 报表中心二级页面
  if (activeSubPage === 'reports') {
    return <ReportsAdmin onBack={() => goSubPage(null)} />
  }

  if (activeSubPage === 'teachers') {
    return <TeacherAdmin onBack={() => goSubPage(null)} />
  }

  // 模块入口定义：按日常使用顺序排列（基础建档 → 教学运营 → 报表 → 系统）
  // 每个入口含权限点、标题、描述、图标、跳转目标，按当前用户权限过滤后再渲染
  const moduleEntries = [
    // ===== 基础教务（建档类：学员 → 年级 → 课程 → 班级 → 教师）=====
    { tab: 'basic', perm: 'students:view', sub: 'students', title: '学员管理', desc: '学员档案、报名汇总、续费预警', icon: 'students' },
    { tab: 'basic', perm: 'grades:view', sub: 'grades', title: '年级管理', desc: '年级维护、批量升班、课程关联', icon: 'grades' },
    { tab: 'basic', perm: 'courses:view', sub: 'courses', title: '课程管理', desc: '课程信息、单价、计费方式、关联年级', icon: 'courses' },
    { tab: 'basic', perm: 'classes:view', sub: 'classes', title: '班级管理', desc: '班级建档、关联课程、固定学员名单', icon: 'classes' },
    { tab: 'basic', perm: 'teachers:view', sub: 'teachers', title: '教师管理', desc: '课后反馈、教师绩效、评分', icon: 'teachers' },
    // ===== 教学运营（业务流转：报名 → 结转退课 → 排课 → 点名）=====
    { tab: 'operation', perm: 'enrollments:view', sub: 'enrollments', title: '报名管理', desc: '报名、购课赠课、课时余额', icon: 'enrollments' },
    { tab: 'operation', perm: 'transfers:view', sub: 'transfers', title: '结转退课', desc: '退课折算入账户余额', icon: 'transfers' },
    { tab: 'operation', perm: 'schedules:view', sub: 'schedules', title: '排课管理', desc: '排课、批量排课、点名扣减', icon: 'schedules' },
    { tab: 'operation', perm: 'attendance:view', sub: 'attendance', title: '点名管理', desc: '按日期点名、批量点名、到课统计', icon: 'attendance' },
    // ===== 报表中心（概览 + 明细报表，合并原数据看板）=====
    { tab: 'data', perm: 'reports:view', sub: 'reports', title: '报表中心', desc: '经营概览、营收、课时、出勤、结转统计', icon: 'reports' },
    // ===== 系统管理（配置 → 公告 → 账号 → 家长端链接 → 日志）=====
    { tab: 'system', perm: 'settings:manage', sub: 'settings', title: '系统设置', desc: '项目名称、备份恢复、有效期', icon: 'settings' },
    { tab: 'system', perm: 'announcement:view', sub: 'announcement', title: '公告管理', desc: '首页/家长端公告内容', icon: 'announcement' },
    { tab: 'system', perm: 'admins:view', sub: 'admins', title: '管理员账号', desc: '账号增删、权限分配、启停', icon: 'admins' },
    { tab: 'system', perm: 'students:view', sub: 'shareLinks', title: '分享链接', desc: '生成家长端专属访问链接', icon: 'shareLinks' },
    { tab: 'system', perm: 'audit:view', sub: 'auditLogs', title: '审计日志', desc: '写操作留痕，按模块/人筛选', icon: 'auditLogs' },
  ] as const

  // 图标 SVG（命令式映射，避免每个入口重复写 svg）
  const iconMap: Record<string, React.ReactNode> = {
    students: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" />,
    grades: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />,
    classes: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />,
    courses: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
    enrollments: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
    transfers: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />,
    schedules: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
    attendance: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    teachers: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />,
    announcement: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />,
    reports: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
    shareLinks: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
    settings: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
    admins: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    auditLogs: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  }

  const tabs = [
    { key: 'basic', label: '基础教务' },
    { key: 'operation', label: '教学运营' },
    { key: 'data', label: '报表中心' },
    { key: 'system', label: '系统管理' },
  ] as const

  // 当前 tab 下可见的入口（按权限过滤）
  const visibleEntries = moduleEntries.filter(
    (e) => e.tab === activeTab && canSeeModule(currentAdmin, e.perm),
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">{'后台管理'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearToken()
                setAuthed(false)
              }}
              className="btn-ghost"
              title={'退出登录'}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">{'退出登录'}</span>
            </button>
            <button onClick={onExit} className="btn-ghost">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">返回首页</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* 分类选项卡：仅允许横向滑动，禁止纵向滑动（移动端修复）；隐藏滚动条保持可滑动 */}
        <div className="flex items-center gap-1 mb-5 border-b border-slate-200 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain no-scrollbar">
          {tabs.map((tab) => {
            const count = moduleEntries.filter(
              (e) => e.tab === tab.key && canSeeModule(currentAdmin, e.perm),
            ).length
            if (count === 0) return null
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs text-slate-400">{count}</span>
              </button>
            )
          })}
        </div>

        {/* 模块入口网格 */}
        {visibleEntries.length === 0 ? (
          <div className="card p-12 text-center text-slate-400 text-sm">
            当前分类暂无可用模块
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleEntries.map((entry) => (
              <button
                key={entry.sub}
                onClick={() => {
                  if (entry.sub === 'announcement') handleLoadAnnouncement()
                  goSubPage(entry.sub as SubPage)
                }}
                className="card p-5 text-left hover:shadow-md hover:border-brand-200 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {iconMap[entry.icon]}
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 mb-1">{entry.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{entry.desc}</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-brand-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

