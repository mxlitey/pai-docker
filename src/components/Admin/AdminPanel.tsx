import { useState, useEffect, useCallback } from 'react'
import type { Student, Course } from '@/types'
import { searchStudents, getAnnouncement } from '@/api'
import {
  seedData,
  clearAllData,
  saveAnnouncement,
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
import { AdvancedAdmin } from './AdvancedAdmin'
import { StudentAdmin } from './StudentAdmin'
import { CourseAdmin } from './CourseAdmin'
import { ScheduleAdmin } from './ScheduleAdmin'
import { AdminLogin } from './AdminLogin'
import { cn } from '@/utils/cn'

interface AdminPanelProps {
  onExit: () => void
}

type Toast = { type: 'success' | 'error' | 'info'; message: string } | null

export function AdminPanel({ onExit }: AdminPanelProps) {
  // 登录状态：有 token 视为已登录
  const [authed, setAuthed] = useState<boolean>(() => !!getToken())
  const [students, setStudents] = useState<Student[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  // 操作状态
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast>(null)

  // 公告设置（进阶管理页编辑 + 保存）
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementUpdatedAt, setAnnouncementUpdatedAt] = useState('')

  // 进阶管理二级页面
  const [showAdvanced, setShowAdvanced] = useState(false)
  // 学员管理二级页面
  const [showStudentAdmin, setShowStudentAdmin] = useState(false)
  // 课程管理二级页面
  const [showCourseAdmin, setShowCourseAdmin] = useState(false)
  // 排课管理二级页面
  const [showScheduleAdmin, setShowScheduleAdmin] = useState(false)

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

  useEffect(() => {
    loadStudents()
    loadCourses()
  }, [loadStudents, loadCourses])

  // 测试数据导入
  const handleSeed = async () => {
    if (!confirm('确认导入测试数据？这将写入 8 名示例学员及 7 月排课数据。')) return
    setBusy(true)
    try {
      const result = await seedData()
      if (result.code === 0) {
        showToast(
          'success',
          `测试数据已导入：${result.data.studentCount} 名学员，${result.data.scheduleCount} 条排课`,
        )
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

  // 清空所有数据
  const handleClear = async () => {
    const step1 = confirm(
      '⚠ 危险操作：将清空 Blob 中所有学员与排课数据，且不可恢复！\n\n确认继续？',
    )
    if (!step1) return
    const step2 = confirm('再次确认：真的要清空全部数据吗？')
    if (!step2) return
    setBusy(true)
    try {
      const result = await clearAllData()
      if (result.code === 0) {
        showToast('success', `已清空 ${result.data.deletedCount} 个对象`)
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

  // 公告：进入进阶管理页时加载当前内容
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

  // 未登录：渲染登录页
  if (!authed) {
    return (
      <AdminLogin
        onSuccess={() => setAuthed(true)}
        onExit={onExit}
      />
    )
  }

  // 进阶管理二级页面
  if (showAdvanced) {
    return (
      <>
        <AdvancedAdmin
          onBack={() => setShowAdvanced(false)}
          onSeed={handleSeed}
          onClear={handleClear}
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">后台管理</h1>
              <p className="text-xs text-slate-400 hidden sm:block">数据管理 · 排课维护</p>
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
                查看全部学员，支持删除学员及其排课数据
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
                管理课程信息（教师/地点/默认时间/颜色），新增排课以课程为单位批量排课
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
                按学员搜索查看排课，新增排课支持多日期 + 按年级批量选学员
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

        {/* 进阶管理入口 */}
        <section className="card p-5 border-amber-200 bg-amber-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-800">进阶管理</div>
                <div className="text-xs text-rose-600 mt-0.5 inline-flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                  </svg>
                  非专业人员禁止操作
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                handleLoadAnnouncement()
                setShowAdvanced(true)
              }}
              className="btn border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 text-sm"
            >
              进入进阶管理 →
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
