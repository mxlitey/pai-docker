import { useState, useEffect, useCallback } from 'react'
import type { Student, Course } from '@/types'
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
  getToken,
  clearToken,
} from '@/api/admin'
import { AnnouncementAdmin } from './AnnouncementAdmin'
import { ShareLinksAdmin } from './ShareLinksAdmin'
import { StudentAdmin } from './StudentAdmin'
import { CourseAdmin } from './CourseAdmin'
import { ScheduleAdmin } from './ScheduleAdmin'
import { AttendanceAdmin } from './AttendanceAdmin'
import { AdminLogin } from './AdminLogin'
import { cn } from '@/utils/cn'

interface AdminPanelProps {
  onExit: () => void
}

type Toast = { type: 'success' | 'error' | 'info'; message: string } | null

export function AdminPanel({ onExit }: AdminPanelProps) {
  // 登录状态：进入时调用后端校验 token，不依赖 localStorage 是否存在 token
  const [authed, setAuthed] = useState<boolean>(false)
  const [checking, setChecking] = useState<boolean>(true)
  const [students, setStudents] = useState<Student[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  // 操作状态
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast>(null)

  // 公告设置（公告管理页编辑 + 保存）
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementUpdatedAt, setAnnouncementUpdatedAt] = useState('')

  // 公告管理二级页面
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  // 分享链接二级页面
  const [showShareLinks, setShowShareLinks] = useState(false)
  // 学员管理二级页面
  const [showStudentAdmin, setShowStudentAdmin] = useState(false)
  // 课程管理二级页面
  const [showCourseAdmin, setShowCourseAdmin] = useState(false)
  // 排课管理二级页面
  const [showScheduleAdmin, setShowScheduleAdmin] = useState(false)
  // 点名管理二级页面
  const [showAttendance, setShowAttendance] = useState(false)

  // 显示 toast
  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  // 统一错误处理：401 时清除 token 并回到登录页
  const handleApiError = (e: Error) => {
    const msg = e.message || ''
    if (msg.includes('未登录') || msg.includes('登录已过期') || msg.includes('401')) {
      clearToken()
      setAuthed(false)
    }
    showToast('error', msg.includes('请求失败') ? msg : '请求失败：' + msg)
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

  // 进入管理页时调用后端校验 token 有效性
  // 防止攻击者在 localStorage 写入伪造 token 绕过前端登录页
  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
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
    checkAuth()
    return () => {
      cancelled = true
    }
  }, [])

  // 鉴权通过后再加载数据
  useEffect(() => {
    if (!authed) return
    loadStudents()
    loadCourses()
  }, [authed, loadStudents, loadCourses])

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
    const step1 = confirm(
      `⚠ 确认删除学员「${student.name}」(${student.id})？\n` +
      `该操作将同时删除该学员的所有排课数据，且不可恢复！`,
    )
    if (!step1) return
    const step2 = confirm('再次确认：真的要删除该学员及其全部排课吗？')
    if (!step2) return
    setBusy(true)
    try {
      const result = await deleteStudent(student.id)
      if (result.code === 0) {
        const msg = result.data.studentRemoved
          ? `已删除学员及 ${result.data.deletedScheduleFiles} 个排课文件`
          : '学员不存在（已清理残留排课文件）'
        showToast('success', msg)
        await loadStudents()
      } else {
        showToast('error', result.message)
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
    const step1 = confirm(
      `⚠ 确认删除课程「${course.name}」(${course.id})？\n` +
      `该操作将同时删除该课程的所有关联排课记录，且不可恢复！`,
    )
    if (!step1) return
    const step2 = confirm('再次确认：真的要删除该课程及其全部排课吗？')
    if (!step2) return
    setBusy(true)
    try {
      const result = await deleteCourse(course.id)
      if (result.code === 0) {
        const msg = result.data.courseRemoved
          ? `已删除课程及 ${result.data.deletedScheduleCount} 条关联排课`
          : '课程不存在'
        showToast('success', msg)
        await loadCourses()
      } else {
        showToast('error', result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent'

  // 校验中：显示加载状态
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <svg className="animate-spin w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          校验登录状态…
        </div>
      </div>
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
  if (showAnnouncement) {
    return (
      <>
        <AnnouncementAdmin
          onBack={() => setShowAnnouncement(false)}
          busy={busy}
          announcementText={announcementText}
          setAnnouncementText={setAnnouncementText}
          announcementUpdatedAt={announcementUpdatedAt}
          onSaveAnnouncement={handleSaveAnnouncement}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 分享链接二级页面
  if (showShareLinks) {
    return (
      <>
        <ShareLinksAdmin
          students={students}
          onBack={() => setShowShareLinks(false)}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 学员管理二级页面
  if (showStudentAdmin) {
    return (
      <>
        <StudentAdmin
          students={students}
          busy={busy}
          onBack={() => setShowStudentAdmin(false)}
          onDelete={handleDeleteStudent}
          onAdd={handleAddStudent}
          onUpdate={handleUpdateStudent}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 课程管理二级页面
  if (showCourseAdmin) {
    return (
      <>
        <CourseAdmin
          courses={courses}
          busy={busy}
          onBack={() => setShowCourseAdmin(false)}
          onDelete={handleDeleteCourse}
          onAdd={handleAddCourse}
          onUpdate={handleUpdateCourse}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 排课管理二级页面
  if (showScheduleAdmin) {
    return (
      <>
        <ScheduleAdmin
          students={students}
          courses={courses}
          onBack={() => setShowScheduleAdmin(false)}
          onToast={showToast}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 点名管理二级页面
  if (showAttendance) {
    return (
      <>
        <AttendanceAdmin
          busy={busy}
          onBack={() => setShowAttendance(false)}
          onLoad={async (d) => {
            const r = await getAttendanceList(d)
            if (r.code !== 0) throw new Error(r.message)
            return r.data
          }}
          onSave={async (d, items) => {
            const r = await setAttendance(d, items)
            if (r.code !== 0) throw new Error(r.message)
            // 保存后刷新学员列表（remainingHours 已更新）
            await loadStudents()
            return r.data
          }}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">后台管理</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearToken()
                setAuthed(false)
              }}
              className="btn-ghost"
              title="退出登录"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">退出登录</span>
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

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s]">
          <div
            className={cn(
              'px-4 py-2.5 rounded-lg shadow-lg text-sm text-white',
              toast.type === 'success' && 'bg-green-600',
              toast.type === 'error' && 'bg-rose-600',
              toast.type === 'info' && 'bg-slate-700',
            )}
          >
            {toast.message}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 学员管理入口 */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-brand-500 rounded"></span>
                学员管理
              </h2>
              <div className="text-xs text-slate-500 mt-1.5 ml-3">
                查看和管理学员数据
              </div>
            </div>
            <button
              onClick={() => setShowStudentAdmin(true)}
              className="btn-primary text-sm py-1.5 px-3"
            >
              进入学员管理 →
            </button>
          </div>
        </section>

        {/* 课程管理入口 */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-brand-500 rounded"></span>
                课程管理
              </h2>
              <div className="text-xs text-slate-500 mt-1.5 ml-3">
                查看和管理课程数据
              </div>
            </div>
            <button
              onClick={() => setShowCourseAdmin(true)}
              className="btn-primary text-sm py-1.5 px-3"
            >
              进入课程管理 →
            </button>
          </div>
        </section>

        {/* 排课管理入口 */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-brand-500 rounded"></span>
                排课管理
              </h2>
              <div className="text-xs text-slate-500 mt-1.5 ml-3">
                查看和管理排课数据
              </div>
            </div>
            <button
              onClick={() => setShowScheduleAdmin(true)}
              className="btn-primary text-sm py-1.5 px-3"
            >
              进入排课管理 →
            </button>
          </div>
        </section>

        {/* 点名管理入口 */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-brand-500 rounded"></span>
                点名管理
              </h2>
              <div className="text-xs text-slate-500 mt-1.5 ml-3">
                查看和管理点名数据
              </div>
            </div>
            <button
              onClick={() => setShowAttendance(true)}
              className="btn-primary text-sm py-1.5 px-3"
            >
              进入点名管理 →
            </button>
          </div>
        </section>

        {/* 公告管理入口 */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-brand-500 rounded"></span>
                公告管理
              </h2>
              <div className="text-xs text-slate-500 mt-1.5 ml-3">
                查看和管理公告内容
              </div>
            </div>
            <button
              onClick={() => {
                handleLoadAnnouncement()
                setShowAnnouncement(true)
              }}
              className="btn-primary text-sm py-1.5 px-3"
            >
              进入公告管理 →
            </button>
          </div>
        </section>

        {/* 分享链接入口 */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-brand-500 rounded"></span>
                分享链接
              </h2>
              <div className="text-xs text-slate-500 mt-1.5 ml-3">
                查看和生成分享链接
              </div>
            </div>
            <button
              onClick={() => setShowShareLinks(true)}
              className="btn-primary text-sm py-1.5 px-3"
            >
              进入分享链接 →
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

// Toast 视图组件（二级页面复用）
function ToastView({ toast }: { toast: NonNullable<Toast> }) {
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s]">
      <div
        className={cn(
          'px-4 py-2.5 rounded-lg shadow-lg text-sm text-white',
          toast.type === 'success' && 'bg-green-600',
          toast.type === 'error' && 'bg-rose-600',
          toast.type === 'info' && 'bg-slate-700',
        )}
      >
        {toast.message}
      </div>
    </div>
  )
}
