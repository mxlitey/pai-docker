import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course, Schedule, Student } from '@/types'
import { getSchedules } from '@/api'
import { deleteSchedule, searchSchedules } from '@/api/admin'
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
import { ScheduleAssistantModal } from './ScheduleAssistantModal'

interface ScheduleAdminProps {
  students: Student[]
  courses: Course[]
  onBack: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

type SearchMode = 'student' | 'filter'

export function ScheduleAdmin({ students, courses, onBack, onToast }: ScheduleAdminProps) {
  const { t } = useTranslation()
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
  const [assistantOpen, setAssistantOpen] = useState(false)

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
    const ok = await confirmDialog({
      title: t('schedule.deleteTitle'),
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
        title={t('schedule.title')}
        onBack={onBack}
        count={schedules.length > 0 ? schedules.length : undefined}
      >
        <Button
          variant="outline"
          onClick={() => setAssistantOpen(true)}
          disabled={busy || students.length === 0 || courses.length === 0}
          title={
            students.length === 0
              ? '请先添加学员数据'
              : courses.length === 0
                ? '请先在课程管理中添加课程'
                : '智能检测多日期冲突，一键排入空闲日期'
          }
        >
          ✨ 智能排课助手
        </Button>
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
          + {t('schedule.addSchedule')}
        </Button>
      </SubPageHeader>

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
                  <label className="block text-xs text-slate-500 mb-1">{t('common.startDate')}</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('common.endDate')}</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('schedule.course')}</label>
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
                  {t('common.search')}
                </Button>
                {(filterStartDate || filterEndDate || filterCourseId) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilterStartDate('')
                      setFilterEndDate('')
                      setFilterCourseId('')
                      setSchedules([])
                      setFilterSubmitted(false)
                    }}
                  >
                    {t('schedule.clearFilter')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                提示：日期范围与课程可单独或组合使用。全部留空将返回全量排课；数据量较大时建议限定日期范围以加快查询。
              </p>
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
                      <th className="text-left py-2 px-2 font-medium">{t('schedule.student')}</th>
                    )}
                    <th className="text-left py-2 px-2 font-medium">{t('schedule.course')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('schedule.date')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('common.time')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('schedule.teacher')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('schedule.location')}</th>
                    <th className="text-right py-2 px-2 font-medium">{t('common.operation')}</th>
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
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(s)}
                          disabled={busy}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
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
          students={students}
          onClose={() => setAddingSchedule(false)}
          onUpdated={handleEditorUpdated}
        />
      )}

      {/* 智能排课助手 */}
      {assistantOpen && (
        <ScheduleAssistantModal
          courses={courses}
          onClose={() => setAssistantOpen(false)}
          onCreated={() => {
            setAssistantOpen(false)
            refreshCurrent()
          }}
        />
      )}
    </div>
  )
}
