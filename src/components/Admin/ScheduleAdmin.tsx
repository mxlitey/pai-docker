import { useCallback, useEffect, useState } from 'react'
import type { Course, Schedule, Student } from '@/types'
import { getSchedules } from '@/api'
import { deleteSchedule, searchSchedules } from '@/api/admin'
import { SearchBar } from '@/components/SearchBar'
import { ScheduleEditor } from './ScheduleEditor'
import { ScheduleAddModal } from './ScheduleAddModal'

interface ScheduleAdminProps {
  students: Student[]
  courses: Course[]
  onBack: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

type SearchMode = 'student' | 'filter'

export function ScheduleAdmin({ students, courses, onBack, onToast }: ScheduleAdminProps) {
  const [mode, setMode] = useState<SearchMode>('student')

  // 按学员模式
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  // 按日期/课程筛选模式
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterCourseId, setFilterCourseId] = useState('')
  // 标记是否已发起过搜索（用于区分"未搜索"与"搜索后无结果"）
  const [filterSubmitted, setFilterSubmitted] = useState(false)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [busy, setBusy] = useState(false)

  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [addingSchedule, setAddingSchedule] = useState(false)

  // 按学员加载排课
  const loadSchedulesByStudent = useCallback(async (studentId: string) => {
    if (!studentId) {
      setSchedules([])
      return
    }
    setLoadingSchedules(true)
    try {
      const list = await getSchedules(studentId)
      setSchedules(list)
    } catch (e) {
      onToast('error', '加载排课失败：' + (e as Error).message)
      setSchedules([])
    } finally {
      setLoadingSchedules(false)
    }
  }, [onToast])

  // 按日期/课程搜索排课
  const runFilterSearch = useCallback(async () => {
    setLoadingSchedules(true)
    try {
      const result = await searchSchedules({
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        courseId: filterCourseId || undefined,
      })
      if (result.code === 0) {
        setSchedules(result.data.schedules)
      } else {
        onToast('error', result.message)
        setSchedules([])
      }
    } catch (e) {
      onToast('error', '搜索排课失败：' + (e as Error).message)
      setSchedules([])
    } finally {
      setFilterSubmitted(true)
      setLoadingSchedules(false)
    }
  }, [filterStartDate, filterEndDate, filterCourseId, onToast])

  // 学员模式：选中学员后自动加载
  useEffect(() => {
    if (mode === 'student') {
      if (selectedStudent) loadSchedulesByStudent(selectedStudent.id)
      else setSchedules([])
    }
  }, [selectedStudent, mode, loadSchedulesByStudent])

  // 切换 Tab：清空另一种模式的状态与结果
  const switchMode = (next: SearchMode) => {
    if (next === mode) return
    setMode(next)
    setSchedules([])
    setFilterSubmitted(false)
    if (next === 'student') {
      // 进入学员模式时不自动选中学员，等用户搜索
      setSelectedStudent(null)
    } else {
      // 进入筛选模式：保留过滤条件，但不自动搜索，等用户点击
    }
  }

  // 刷新当前模式的结果列表（删除/编辑后调用）
  const refreshCurrent = useCallback(async () => {
    if (mode === 'student') {
      if (selectedStudent) await loadSchedulesByStudent(selectedStudent.id)
    } else {
      await runFilterSearch()
    }
  }, [mode, selectedStudent, loadSchedulesByStudent, runFilterSearch])

  // 删除单条排课
  const handleDeleteSchedule = async (schedule: Schedule) => {
    if (!confirm(`确认删除「${schedule.courseName}」(${schedule.date})？`)) return
    setBusy(true)
    try {
      const result = await deleteSchedule(schedule.id, schedule.studentId, schedule.date)
      if (result.code === 0) {
        onToast('success', '排课已删除')
        await refreshCurrent()
      } else {
        onToast('error', result.message)
      }
    } catch (e) {
      onToast('error', '请求失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // 新增/编辑后刷新
  const handleEditorUpdated = async () => {
    await refreshCurrent()
  }

  // 表格表头：筛选模式多一列"学员"
  const showStudentColumn = mode === 'filter'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回后台
            </button>
            <span className="text-slate-300">/</span>
            <h1 className="text-base font-semibold text-slate-800">排课管理</h1>
          </div>
          <div className="flex items-center gap-3">
            {schedules.length > 0 && (
              <span className="text-xs text-slate-400 hidden sm:block">
                共 {schedules.length} 条排课
              </span>
            )}
            <button
              onClick={() => setAddingSchedule(true)}
              disabled={busy || students.length === 0 || courses.length === 0}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
              title={
                students.length === 0
                  ? '请先添加学员数据'
                  : courses.length === 0
                    ? '请先在课程管理中添加课程'
                    : '按课程为多个学员批量排课'
              }
            >
              + 新增排课
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 搜索区：双 Tab */}
        <section className="card p-5">
          {/* Tab 切换 */}
          <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
            <button
              onClick={() => switchMode('student')}
              className={
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ' +
                (mode === 'student'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700')
              }
            >
              按学员搜索
            </button>
            <button
              onClick={() => switchMode('filter')}
              className={
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ' +
                (mode === 'filter'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700')
              }
            >
              按日期 / 课程筛选
            </button>
          </div>

          {mode === 'student' ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-sm text-slate-500">搜索学员：</span>
              <div className="w-full max-w-md">
                <SearchBar onSelectStudent={setSelectedStudent} />
              </div>
              {selectedStudent && (
                <span className="text-xs text-slate-400">
                  当前：{selectedStudent.name}
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">课程</label>
                  <select
                    value={filterCourseId}
                    onChange={(e) => setFilterCourseId(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[8rem]"
                  >
                    <option value="">全部课程</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={runFilterSearch}
                  disabled={loadingSchedules}
                  className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50"
                >
                  {loadingSchedules ? '搜索中…' : '搜索'}
                </button>
                {(filterStartDate || filterEndDate || filterCourseId) && (
                  <button
                    onClick={() => {
                      setFilterStartDate('')
                      setFilterEndDate('')
                      setFilterCourseId('')
                      setSchedules([])
                      setFilterSubmitted(false)
                    }}
                    className="btn-ghost text-sm py-1.5 px-3 border border-slate-200"
                  >
                    清空条件
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                提示：日期范围与课程可单独或组合使用。全部留空将返回全量排课；数据量较大时建议限定日期范围以加快查询。
              </p>
            </div>
          )}
        </section>

        {/* 排课列表 */}
        <section className="card p-5">
          {/* 空状态文案：区分"未操作"与"搜索后无结果" */}
          {mode === 'student' && !selectedStudent ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              请搜索并选择学员查看排课列表
            </div>
          ) : mode === 'filter' && !filterSubmitted ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              请设置筛选条件并点击「搜索」
            </div>
          ) : loadingSchedules ? (
            <div className="text-center py-10">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              {mode === 'student' ? '该学员暂无排课' : '没有符合条件的排课'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    {showStudentColumn && (
                      <th className="text-left py-2 px-2 font-medium">学员</th>
                    )}
                    <th className="text-left py-2 px-2 font-medium">课程</th>
                    <th className="text-left py-2 px-2 font-medium">日期</th>
                    <th className="text-left py-2 px-2 font-medium">时间</th>
                    <th className="text-left py-2 px-2 font-medium">教师</th>
                    <th className="text-left py-2 px-2 font-medium">地点</th>
                    <th className="text-right py-2 px-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      {showStudentColumn && (
                        <td className="py-2.5 px-2 text-slate-700 font-medium whitespace-nowrap">
                          {s.studentName}
                        </td>
                      )}
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-slate-700">{s.courseName}</div>
                        <div className="text-xs text-slate-400 font-mono">{s.id}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{s.date}</td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {s.startTime}-{s.endTime}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{s.teacher}</td>
                      <td className="py-2.5 px-2 text-slate-600">{s.location}</td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditingSchedule(s)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(s)}
                          disabled={busy}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* 编辑弹窗 */}
      <ScheduleEditor
        schedule={editingSchedule}
        students={students}
        onClose={() => setEditingSchedule(null)}
        onUpdated={handleEditorUpdated}
      />

      {/* 新增弹窗 */}
      {addingSchedule && (
        <ScheduleAddModal
          courses={courses}
          students={students}
          onClose={() => setAddingSchedule(false)}
          onUpdated={handleEditorUpdated}
        />
      )}
    </div>
  )
}
