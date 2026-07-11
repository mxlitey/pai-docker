import { useState, useEffect, useCallback } from 'react'
import type { Student, Course, EnrollmentSummary, Grade, CurrentAdmin } from '@/types'
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
import { getAppName } from '@/config'
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
import {
  SidebarProvider, Sidebar, SidebarTrigger, SidebarRail, SidebarInset,
  SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  useSidebar,
} from '@/components/ui/shadcn/sidebar'
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from '@/components/ui/shadcn/breadcrumb'
import { Separator } from '@/components/ui/shadcn/separator'
import {
  Loader2,
  LogOut,
  User,
  Users,
  GraduationCap,
  LayoutGrid,
  BookOpen,
  ClipboardCheck,
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  Presentation,
  Megaphone,
  BarChart3,
  Link2,
  Settings,
  ShieldCheck,
  FileText,
  GalleryVerticalEnd,
} from 'lucide-react'

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

// 图标映射：使用 lucide-react 图标，避免每个入口重复写 svg
const iconMap: Record<string, React.ReactNode> = {
  students: <Users className="w-5 h-5" />,
  grades: <GraduationCap className="w-5 h-5" />,
  classes: <LayoutGrid className="w-5 h-5" />,
  courses: <BookOpen className="w-5 h-5" />,
  enrollments: <ClipboardCheck className="w-5 h-5" />,
  transfers: <ArrowLeftRight className="w-5 h-5" />,
  schedules: <Calendar className="w-5 h-5" />,
  attendance: <CheckCircle2 className="w-5 h-5" />,
  teachers: <Presentation className="w-5 h-5" />,
  announcement: <Megaphone className="w-5 h-5" />,
  reports: <BarChart3 className="w-5 h-5" />,
  shareLinks: <Link2 className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
  admins: <ShieldCheck className="w-5 h-5" />,
  auditLogs: <FileText className="w-5 h-5" />,
}

const tabs = [
  { key: 'basic', label: '基础教务' },
  { key: 'operation', label: '教学运营' },
  { key: 'data', label: '报表中心' },
  { key: 'system', label: '系统管理' },
] as const

// AppSidebar：后台侧边栏，按分组渲染模块入口，按权限过滤
interface AppSidebarProps {
  activeSubPage: SubPage
  appName: string
  currentAdmin: CurrentAdmin | null
  onSelect: (sub: SubPage) => void
  onLogout: () => void
}

function AppSidebar({ activeSubPage, appName, currentAdmin, onSelect, onLogout }: AppSidebarProps) {
  const { setOpenMobile } = useSidebar()

  const handleSelect = (sub: SubPage) => {
    onSelect(sub)
    setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => handleSelect(null)}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GalleryVerticalEnd className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">{appName}</span>
                <span className="text-xs text-muted-foreground">后台管理</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {tabs.map((tab) => {
          const entries = moduleEntries.filter(
            (e) => e.tab === tab.key && canSeeModule(currentAdmin, e.perm),
          )
          if (entries.length === 0) return null
          return (
            <SidebarGroup key={tab.key}>
              <SidebarGroupLabel>{tab.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {entries.map((entry) => (
                    <SidebarMenuItem key={entry.sub}>
                      <SidebarMenuButton
                        isActive={activeSubPage === entry.sub}
                        onClick={() => handleSelect(entry.sub as SubPage)}
                        tooltip={entry.desc}
                      >
                        {iconMap[entry.icon]}
                        <span>{entry.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
            <User className="size-4" />
          </div>
          <div className="grid flex-1 min-w-0 text-left text-sm leading-tight">
            <span className="truncate font-semibold">
              {currentAdmin?.realName || currentAdmin?.username || '未登录'}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {currentAdmin?.username || ''}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="退出登录"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
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

  // 项目名称（与系统设置同步，侧边栏头部展示）
  const [appName, setAppName] = useState(getAppName())

  // 公告设置（公告管理页编辑 + 保存）
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementUpdatedAt, setAnnouncementUpdatedAt] = useState('')

  // 当前激活的二级页面：初始值从 URL hash 恢复，避免刷新时丢失
  const [activeSubPage, setActiveSubPage] = useState<SubPage>(() =>
    readSubPageFromHash(),
  )
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

  // 侧边栏菜单选择：进入公告页时需预加载公告内容
  const handleSelect = (sub: SubPage) => {
    if (sub === 'announcement') handleLoadAnnouncement()
    goSubPage(sub)
  }

  // 校验中：显示加载状态
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="animate-spin w-4 h-4 text-primary" />
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

  // 当前激活模块（用于面包屑标题）
  const currentModule = activeSubPage
    ? moduleEntries.find((e) => e.sub === activeSubPage)
    : null

  // 渲染当前子页面内容（保留原有所有分支）
  const renderSubPage = () => {
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
            onConfigChanged={setAppName}
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

    return null
  }

  return (
    <SidebarProvider>
      <AppSidebar
        activeSubPage={activeSubPage}
        appName={appName}
        currentAdmin={currentAdmin}
        onSelect={handleSelect}
        onLogout={() => {
          clearToken()
          setAuthed(false)
        }}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {activeSubPage ? (
                  <BreadcrumbLink asChild>
                    <button
                      onClick={() => handleSelect(null)}
                      className="cursor-pointer"
                    >
                      后台管理
                    </button>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>后台管理</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {currentModule && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentModule.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex-1 overflow-auto">
          {activeSubPage === null ? (
            <div className="flex min-h-full items-center justify-center p-8">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-semibold text-foreground mb-2">
                  欢迎使用后台管理
                </h2>
                <p className="text-sm text-muted-foreground">
                  请从左侧菜单选择要管理的模块
                </p>
              </div>
            </div>
          ) : (
            renderSubPage()
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
