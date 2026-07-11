import { useCallback, useEffect, useState } from 'react'
import type { Course, Schedule, Student, ClassInfo, Grade } from '@/types'
import { getSchedules } from '@/api'
import { deleteSchedule, searchSchedules, listClasses } from '@/api/admin'
import { SearchBar } from '@/components/SearchBar'
import { cn } from '@/utils/cn'
import {
  Button,
  EmptyState,
  LoadingBlock,
  SubPageHeader,
  confirmDialog,
  inputClass,
} from '@/components/ui'
import { ScheduleEditor } from './ScheduleEditor'
import { ScheduleAddModal } from './ScheduleAddModal'
import { RescheduleModal } from './RescheduleModal'

interface ScheduleAdminProps {
  students: Student[]
  courses: Course[]
  grades: Grade[]
  onBack: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

type SearchMode = 'student' | 'filter'

export function ScheduleAdmin({ students, courses, grades, onBack, onToast }: ScheduleAdminProps) {
  const [mode, setMode] = useState<SearchMode>('filter')

  // 按学员模式
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  // 按日期/课程/年级筛选模式
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterCourseId, setFilterCourseId] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  // 标记是否已发起过搜索（用于区分"未搜索"与"搜索后无结果"）
  const [filterSubmitted, setFilterSubmitted] = useState(false)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [busy, setBusy] = useState(false)

  // 班级列表：排课弹窗按班级带出成员名单
  const [classes, setClasses] = useState<ClassInfo[]>([])

  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [addingSchedule, setAddingSchedule] = useState(false)
  const [reschedulingSchedule, setReschedulingSchedule] = useState<Schedule | null>(null)

  // 加载班级列表（active 状态）
  const loadClasses = useCallback(async () => {
    try {
      const result = await listClasses({ status: 'active' })
      if (result.code === 0) {
        setClasses(result.data.classes)
      }
    } catch (e) {
      console.error('加载班级列表失败:', e)
    }
  }, [])

  // 进入页面时加载班级（供排课弹窗使用）
  useEffect(() => {
    loadClasses()
  }, [loadClasses])

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

  // 按日期/课程/年级搜索排课
  const runFilterSearch = useCallback(async () => {
    setLoadingSchedules(true)
    try {
      const result = await searchSchedules({
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        courseId: filterCourseId || undefined,
        grade: filterGrade || undefined,
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
  }, [filterStartDate, filterEndDate, filterCourseId, filterGrade, onToast])

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
    const ok = await confirmDialog({
      title: '删除排课',
      message: `确认删除「${schedule.courseName}」(${schedule.date})？此操作不可恢复。`,
      danger: true,
      confirmText: '确认删除',
    })
    if (!ok) return
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
      <SubPageHeader
        title={'排课管理'}
        onBack={onBack}
        count={schedules.length > 0 ? schedules.length : undefined}
      >
        <Button
          variant="primary"
          onClick={() => setAddingSchedule(true)}
          disabled={busy || students.length === 0 || courses.length === 0}
          title={
            students.length === 0
              ? '请先添加学员数据'
              : courses.length === 0
                ? '请先在课程管理中添加课程'
                : '按课程为多个学员批量排课'
          }
        >
          + {'新增排课'}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 搜索区：双 Tab */}
        <section className="card p-5">
          {/* Tab 切换 */}
          <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
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
          </div>

          {mode === 'filter' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{'年级'}</label>
                  <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className={cn(inputClass, 'bg-white', 'min-w-[8rem]')}
                  >
                    <option value="">全部年级</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{'开始日期'}</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{'结束日期'}</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{'课程'}</label>
                  <select
                    value={filterCourseId}
                    onChange={(e) => setFilterCourseId(e.target.value)}
                    className={cn(inputClass, 'bg-white', 'min-w-[8rem]')}
                  >
                    <option value="">全部课程</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="primary" loading={loadingSchedules} onClick={runFilterSearch}>
                  {'搜索'}
                </Button>
                {(filterStartDate || filterEndDate || filterCourseId || filterGrade) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilterStartDate('')
                      setFilterEndDate('')
                      setFilterCourseId('')
                      setFilterGrade('')
                      setSchedules([])
                      setFilterSubmitted(false)
                    }}
                  >
                    {'清空条件'}
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                提示：年级、日期范围与课程可单独或组合使用。全部留空将返回全量排课；数据量较大时建议限定日期范围以加快查询。
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-sm text-slate-500">搜索学员：</span>
              <div className="w-full max-w-md">
                <SearchBar onSelectStudent={setSelectedStudent} students={students} />
              </div>
              {selectedStudent && (
                <span className="text-xs text-slate-400">
                  当前：{selectedStudent.name}
                </span>
              )}
            </div>
          )}
        </section>

        {/* 排课列表：空状态文案区分"未操作"与"搜索后无结果" */}
        {mode === 'student' && !selectedStudent ? (
          <EmptyState
            title="请搜索并选择学员"
            description="选择学员后即可查看其排课列表"
          />
        ) : mode === 'filter' && !filterSubmitted ? (
          <EmptyState
            title="请设置筛选条件"
            description="设置日期范围或课程后点击「搜索」查看排课"
          />
        ) : loadingSchedules ? (
          <LoadingBlock />
        ) : schedules.length === 0 ? (
          <EmptyState
            title={mode === 'student' ? '该学员暂无排课' : '没有符合条件的排课'}
            description={
              mode === 'student'
                ? '可点击右上角「新增排课」为该学员添加课程'
                : '请调整筛选条件后重试'
            }
          />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    {showStudentColumn && (
                      <th className="text-left py-2 px-2 font-medium">{'学员'}</th>
                    )}
                    <th className="text-left py-2 px-2 font-medium">{'课程'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'日期'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'时间'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'教师'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'地点'}</th>
                    <th className="text-right py-2 px-2 font-medium">{'操作'}</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => {
                    // 仅未点名且未取消的排课才可编辑/删除；到课、缺勤、已取消的排课不可改不可删
                    const canModify = s.status !== 'cancelled' && s.attended !== true && s.attended !== false
                    return (
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
                        <div className="font-medium text-slate-700 flex items-center gap-1.5 flex-wrap">
                          {s.courseName}
                          {s.makeupFor && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded" title={`补课自 ${s.makeupFor}`}>
                              补课
                            </span>
                          )}
                          {s.rescheduledFrom && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded" title={`调课自 ${s.rescheduledFrom}`}>
                              调课
                            </span>
                          )}
                          {s.status === 'cancelled' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 rounded">
                              已取消
                            </span>
                          )}
                          {s.attended === true && s.status !== 'cancelled' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 rounded">
                              到课
                            </span>
                          )}
                          {s.attended === false && s.status !== 'cancelled' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200 rounded">
                              缺勤
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{s.id}</div>
                        {s.makeupFor && (
                          <div className="text-[10px] text-amber-500 font-mono mt-0.5" title="原缺勤排课ID">
                            ← {s.makeupFor}
                          </div>
                        )}
                        {s.rescheduledFrom && (
                          <div className="text-[10px] text-blue-400 font-mono mt-0.5" title="原排课ID">
                            ← {s.rescheduledFrom}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{s.date}</td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {s.startTime}-{s.endTime}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{s.teacher}</td>
                      <td className="py-2.5 px-2 text-slate-600">{s.location}</td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        {canModify && (
                          <button
                            onClick={() => setEditingSchedule(s)}
                            disabled={busy}
                            className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                          >
                            {'编辑'}
                          </button>
                        )}
                        {s.status !== 'cancelled' && s.attended === false && (
                          <button
                            onClick={() => setReschedulingSchedule(s)}
                            disabled={busy}
                            className="text-amber-600 hover:text-amber-700 text-xs font-medium mr-3 disabled:opacity-50"
                          >
                            {'补课'}
                          </button>
                        )}
                        {s.status !== 'cancelled' && s.attended !== true && s.attended !== false && !s.makeupFor && !s.rescheduledFrom && (
                          <button
                            onClick={() => setReschedulingSchedule(s)}
                            disabled={busy}
                            className="text-blue-600 hover:text-blue-700 text-xs font-medium mr-3 disabled:opacity-50"
                          >
                            {'调课'}
                          </button>
                        )}
                        {canModify && (
                          <button
                            onClick={() => handleDeleteSchedule(s)}
                            disabled={busy}
                            className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                          >
                            {'删除'}
                          </button>
                        )}
                        {!canModify && (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
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
          classes={classes}
          onClose={() => setAddingSchedule(false)}
          onUpdated={handleEditorUpdated}
        />
      )}

      {/* 调课弹窗 */}
      <RescheduleModal
        schedule={reschedulingSchedule}
        courses={courses}
        classes={classes}
        onClose={() => setReschedulingSchedule(null)}
        onUpdated={handleEditorUpdated}
        onToast={onToast}
      />

    </div>
  )
}
