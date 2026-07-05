import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Schedule, Student, ViewMode } from '@/types'
import { getSchedules, getAnnouncement, searchStudents } from '@/api'
import {
  getViewTitle,
  navigateDate,
  getMonthRange,
  getWeekRange,
  formatDate,
} from '@/utils/date'
import { SearchBar } from '@/components/SearchBar'
import { ScheduleDetail } from '@/components/ScheduleDetail'
import { CalendarToolbar } from '@/components/Calendar/CalendarToolbar'
import { MonthView } from '@/components/Calendar/MonthView'
import { WeekView } from '@/components/Calendar/WeekView'
import { DayView } from '@/components/Calendar/DayView'
import { AdminPanel } from '@/components/Admin/AdminPanel'
import { Home } from '@/components/Home/Home'
import { APP_NAME, FOOTER_TEXT, GITHUB_URL } from '@/config'

// 页面模式：首页 / 日历视图（二级页） / 后台管理
type PageMode = 'home' | 'calendar' | 'admin'

export default function App() {
  // 启动时从 localStorage 恢复上次搜索的学员，实现首页刷新后回显
  const [page, setPage] = useState<PageMode>('home')
  const [view, setView] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(() => {
    try {
      const raw = localStorage.getItem('lastStudent')
      return raw ? (JSON.parse(raw) as Student) : null
    } catch {
      return null
    }
  })
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [detailSchedule, setDetailSchedule] = useState<Schedule | null>(null)
  // 公告内容：启动时异步从后端加载，失败时静默为空
  const [announcement, setAnnouncement] = useState('')

  // 浏览器标签标题跟随环境变量 APP_NAME
  useEffect(() => {
    document.title = APP_NAME
  }, [])

  // 启动时异步加载公告（无需鉴权，不阻塞主流程）
  useEffect(() => {
    let active = true
    getAnnouncement().then((info) => {
      if (active) setAnnouncement(info.content)
    })
    return () => {
      active = false
    }
  }, [])

  // 根据当前视图计算日期范围
  const dateRange = useMemo(() => {
    if (view === 'month') return getMonthRange(currentDate)
    if (view === 'week') return getWeekRange(currentDate)
    return { start: currentDate, end: currentDate }
  }, [view, currentDate])

  // 加载排课数据（仅依赖学员 id 与日期范围，避免学员对象引用变化导致重渲染循环）
  const loadSchedules = useCallback(async () => {
    if (!selectedStudent) {
      setSchedules([])
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const data = await getSchedules(
        selectedStudent.id,
        formatDate(dateRange.start),
        formatDate(dateRange.end),
      )
      setSchedules(data)
    } catch (e) {
      setSchedules([])
      setLoadError((e as Error).message || '加载排课数据失败')
    } finally {
      setLoading(false)
    }
  }, [selectedStudent?.id, dateRange])

  // 选中学员变化时，拉取最新学员信息（含 hours/remainingHours）
  // 依赖仅 id 字符串，更新为同 id 的新对象不会重触发，避免循环
  useEffect(() => {
    if (!selectedStudent?.id) return
    let active = true
    searchStudents(selectedStudent.name)
      .then((list) => {
        if (!active) return
        const latest = list.find((s) => s.id === selectedStudent.id)
        if (latest) {
          setSelectedStudent(latest)
          try {
            localStorage.setItem('lastStudent', JSON.stringify(latest))
          } catch {
            // localStorage 不可用时静默忽略
          }
        }
      })
      .catch(() => {
        // 刷新失败时静默，保留现有学员信息
      })
    return () => {
      active = false
    }
  }, [selectedStudent?.id, selectedStudent?.name])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date())
    } else {
      setCurrentDate((d) => navigateDate(d, view, direction))
    }
  }

  const handleViewChange = (v: ViewMode) => {
    setView(v)
  }

  // 首页搜索选中学员 → 持久化到 localStorage，停留在首页等待用户点击「查看排课」
  const handleSelectStudentFromHome = (student: Student) => {
    setSelectedStudent(student)
    try {
      localStorage.setItem('lastStudent', JSON.stringify(student))
    } catch {
      // localStorage 不可用时静默忽略
    }
  }

  // 首页搜索框内容变化：清空时清除选中状态与持久化记录
  const handleHomeQueryChange = (q: string) => {
    if (!q.trim()) {
      setSelectedStudent(null)
      try {
        localStorage.removeItem('lastStudent')
      } catch {
        // 忽略
      }
    }
  }

  // 首页点击「查看排课」→ 跳转日历页加载该学员排课
  const handleViewSchedule = () => {
    if (selectedStudent) setPage('calendar')
  }

  // 日历页内搜索选中学员
  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student)
  }

  // 统计信息
  const stats = useMemo(() => {
    if (!selectedStudent) return null
    const count = schedules.length
    const courses = new Set(schedules.map((s) => s.courseName)).size
    const teachers = new Set(schedules.map((s) => s.teacher)).size
    return { count, courses, teachers }
  }, [selectedStudent, schedules])

  // 首页：类百度简洁首页
  if (page === 'home') {
    return (
      <Home
        announcement={announcement}
        selectedStudent={selectedStudent}
        initialQuery={selectedStudent?.name || ''}
        onSelectStudent={handleSelectStudentFromHome}
        onQueryChange={handleHomeQueryChange}
        onViewSchedule={handleViewSchedule}
        onEnterAdmin={() => setPage('admin')}
      />
    )
  }

  // 后台管理
  if (page === 'admin') {
    return <AdminPanel onExit={() => setPage('home')} />
  }

  // 日历视图（二级页）
  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage('home')}
                className="btn-ghost -ml-2 px-2"
                title="返回首页"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold text-slate-800">{APP_NAME}</h1>
            </div>
            <div className="flex items-center gap-2">
              <SearchBar onSelectStudent={handleSelectStudent} />
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* 学员信息条 */}
        {selectedStudent ? (
          <div className="card p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-lg font-semibold">
                {selectedStudent.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{selectedStudent.name}</span>
                  {selectedStudent.grade && (
                    <span className="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-500">
                      {selectedStudent.grade}
                    </span>
                  )}
                </div>
                {selectedStudent.phone && (
                  <div className="text-xs text-slate-400 mt-0.5">{selectedStudent.phone}</div>
                )}
              </div>
            </div>
            {stats && (
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-brand-600">{stats.count}</div>
                  <div className="text-xs text-slate-400">排课</div>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="text-center">
                  <div className="font-semibold text-brand-600">{stats.courses}</div>
                  <div className="text-xs text-slate-400">课程</div>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="text-center">
                  <div className="font-semibold text-brand-600">{stats.teachers}</div>
                  <div className="text-xs text-slate-400">教师</div>
                </div>
                {selectedStudent.hours !== undefined && (
                  <>
                    <div className="w-px h-8 bg-slate-100" />
                    <div className="text-center">
                      <div
                        className={
                          selectedStudent.remainingHours === 0
                            ? 'font-semibold text-rose-600'
                            : selectedStudent.remainingHours !== undefined &&
                              selectedStudent.remainingHours < 0
                            ? 'font-semibold text-rose-600'
                            : 'font-semibold text-brand-600'
                        }
                      >
                        {selectedStudent.remainingHours ?? selectedStudent.hours}
                        <span className="text-slate-400 font-normal text-xs"> / {selectedStudent.hours}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {selectedStudent.remainingHours === 0 ? '课时已用完' : '剩余课时'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card p-8 mb-4 text-center">
            <div className="flex flex-col items-center text-slate-400">
              <svg className="w-14 h-14 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">请在上方搜索栏输入学员姓名，查看排课日历</p>
              <p className="text-xs mt-1 text-slate-300">支持精确查询与模糊搜索</p>
            </div>
          </div>
        )}

        {/* 日历区 */}
        {selectedStudent && (
          <>
            {/* 工具栏 */}
            <div className="mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-800">
                  {getViewTitle(currentDate, view)}
                </h2>
                <CalendarToolbar
                  currentDate={currentDate}
                  view={view}
                  onNavigate={handleNavigate}
                  onViewChange={handleViewChange}
                />
              </div>
            </div>

            {/* 视图内容 */}
            {loading ? (
              <div className="card p-16 flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin mb-3" />
                <span className="text-sm text-slate-400">加载排课数据…</span>
              </div>
            ) : loadError ? (
              <div className="card p-16 flex flex-col items-center justify-center">
                <div className="text-rose-500 mb-2">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-sm text-rose-600 mb-1">加载失败</p>
                <p className="text-xs text-slate-400">{loadError}</p>
              </div>
            ) : (
              <>
                {view === 'month' && (
                  <MonthView
                    currentDate={currentDate}
                    schedules={schedules}
                    onScheduleClick={setDetailSchedule}
                  />
                )}
                {view === 'week' && (
                  <WeekView
                    currentDate={currentDate}
                    schedules={schedules}
                    onScheduleClick={setDetailSchedule}
                  />
                )}
                {view === 'day' && (
                  <DayView
                    currentDate={currentDate}
                    schedules={schedules}
                    onScheduleClick={setDetailSchedule}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* 底部 */}
      <footer className="border-t border-slate-200 py-3 text-center text-xs text-slate-400">
        <span>{FOOTER_TEXT}</span>
        {GITHUB_URL && (
          <>
            <span className="mx-2">·</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-brand-500 transition-colors inline-flex items-center gap-1 align-middle"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.72-4.04-1.59-4.04-1.59-.55-1.38-1.34-1.75-1.34-1.75-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.23 1.85 1.23 1.07 1.8 2.81 1.28 3.5.98.11-.77.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.23-3.17-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.21a11.6 11.6 0 016 0c2.3-1.53 3.3-1.21 3.3-1.21.65 1.65.24 2.87.12 3.17.77.83 1.23 1.88 1.23 3.17 0 4.53-2.81 5.52-5.49 5.81.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .32.21.7.82.58A12.04 12.04 0 0024 12.29C24 5.78 18.63.5 12 .5z" />
              </svg>
              GitHub
            </a>
          </>
        )}
      </footer>

      {/* 详情弹窗 */}
      <ScheduleDetail schedule={detailSchedule} onClose={() => setDetailSchedule(null)} />
    </div>
  )
}
