import { useState, useEffect, useCallback, useRef } from 'react'
import type { Schedule, Student } from '@/types'
import { searchStudents, getSchedules } from '@/api'
import {
  seedData,
  clearAllData,
  importData,
  deleteSchedule,
  deleteStudent,
  addStudent,
  getToken,
  clearToken,
} from '@/api/admin'
import { ScheduleEditor } from './ScheduleEditor'
import { AdvancedAdmin } from './AdvancedAdmin'
import { StudentAdmin } from './StudentAdmin'
import { SearchBar } from '@/components/SearchBar'
import { AdminLogin } from './AdminLogin'
import { cn } from '@/utils/cn'

interface AdminPanelProps {
  onExit: () => void
}

type Toast = { type: 'success' | 'error' | 'info'; message: string } | null

// 客户端数据完整性校验（与服务端 validateAll 规则一致）
// 用于「校验数据完整性」按钮，导入前预检
function validateImportData(data: {
  students?: any[]
  schedules?: any[]
}): string[] {
  const errors: string[] = []
  const studentIdSet = new Set<string>()
  const scheduleIdSet = new Set<string>()
  const studentIds = new Set<string>(
    (data.students || []).map((s) => s?.id).filter(Boolean),
  )

  // 校验学员
  ;(data.students || []).forEach((s, i) => {
    const row = i + 1
    if (!s || typeof s !== 'object') {
      errors.push(`学员第${row}条不是有效对象`)
      return
    }
    if (!s.id) errors.push(`学员第${row}条缺少 id`)
    if (!s.name) errors.push(`学员第${row}条缺少 name`)
    if (s.id) {
      if (studentIdSet.has(s.id)) errors.push(`学员第${row}条 id 重复: "${s.id}"`)
      else studentIdSet.add(s.id)
    }
  })

  // 校验排课
  ;(data.schedules || []).forEach((s, i) => {
    const row = i + 1
    if (!s || typeof s !== 'object') {
      errors.push(`排课第${row}条不是有效对象`)
      return
    }
    if (!s.id) errors.push(`排课第${row}条缺少 id`)
    if (!s.studentId) errors.push(`排课第${row}条缺少 studentId`)
    if (!s.courseName) errors.push(`排课第${row}条缺少 courseName`)
    if (!s.date) {
      errors.push(`排课第${row}条缺少 date`)
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
      errors.push(`排课第${row}条 date 格式应为 yyyy-MM-dd，当前为 "${s.date}"`)
    }
    if (s.startTime && !/^\d{2}:\d{2}$/.test(s.startTime)) {
      errors.push(`排课第${row}条 startTime 格式应为 HH:mm，当前为 "${s.startTime}"`)
    }
    if (s.endTime && !/^\d{2}:\d{2}$/.test(s.endTime)) {
      errors.push(`排课第${row}条 endTime 格式应为 HH:mm，当前为 "${s.endTime}"`)
    }
    if (s.id) {
      if (scheduleIdSet.has(s.id)) errors.push(`排课第${row}条 id 重复: "${s.id}"`)
      else scheduleIdSet.add(s.id)
    }
    // 跨表关联：studentId 必须在学员表中存在
    if (s.studentId && studentIds.size > 0 && !studentIds.has(s.studentId)) {
      errors.push(`排课第${row}条 studentId="${s.studentId}" 在学员表中不存在`)
    }
  })

  return errors
}

export function AdminPanel({ onExit }: AdminPanelProps) {
  // 登录状态：有 token 视为已登录
  const [authed, setAuthed] = useState<boolean>(() => !!getToken())
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)

  // 操作状态
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast>(null)

  // JSON 导入
  const [jsonText, setJsonText] = useState('')
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 数据完整性校验结果（null 表示未校验，空数组表示通过，非空为问题列表）
  const [validationResults, setValidationResults] = useState<string[] | null>(null)

  // 编辑器
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  // 新增排课弹窗
  const [addingSchedule, setAddingSchedule] = useState(false)
  // 进阶管理二级页面
  const [showAdvanced, setShowAdvanced] = useState(false)
  // 学员管理二级页面
  const [showStudentAdmin, setShowStudentAdmin] = useState(false)

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

  // 加载某学员排课
  const loadSchedules = useCallback(async (studentId: string) => {
    if (!studentId) {
      setSchedules([])
      return
    }
    setLoadingSchedules(true)
    try {
      const list = await getSchedules(studentId)
      setSchedules(list)
    } catch (e) {
      showToast('error', '加载排课失败：' + (e as Error).message)
      setSchedules([])
    } finally {
      setLoadingSchedules(false)
    }
  }, [])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  useEffect(() => {
    if (selectedStudent) loadSchedules(selectedStudent.id)
  }, [selectedStudent, loadSchedules])

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
        if (selectedStudent) await loadSchedules(selectedStudent.id)
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
        setSchedules([])
        setSelectedStudent(null)
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

  // JSON 文本解析
  function parseJsonText(): {
    mode?: 'merge' | 'replace'
    students?: Student[]
    schedules?: Schedule[]
  } | null {
    try {
      const obj = JSON.parse(jsonText)
      if (!Array.isArray(obj.students) && !Array.isArray(obj.schedules)) {
        showToast('error', 'JSON 需包含 students 或 schedules 数组')
        return null
      }
      return obj
    } catch (e) {
      showToast('error', 'JSON 格式错误：' + (e as Error).message)
      return null
    }
  }

  // JSON 导入
  const handleImport = async () => {
    const body = parseJsonText()
    if (!body) return
    setBusy(true)
    try {
      const result = await importData({
        mode: importMode,
        students: body.students,
        schedules: body.schedules,
      })
      if (result.code === 0) {
        showToast(
          'success',
          `导入成功：学员 ${result.data.importedStudents} 条，排课 ${result.data.importedSchedules} 条`,
        )
        setJsonText('')
        setValidationResults(null)
        await loadStudents()
        if (selectedStudent) await loadSchedules(selectedStudent.id)
      } else {
        // 服务端校验失败时，展示详细错误列表
        const serverErrors = (result.data as any)?.errors
        if (Array.isArray(serverErrors) && serverErrors.length > 0) {
          setValidationResults(serverErrors)
        }
        showToast('error', result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  // 数据完整性校验（仅本地预检，不发起导入请求）
  const handleValidate = () => {
    const body = parseJsonText()
    if (!body) return
    const errors = validateImportData(body)
    setValidationResults(errors)
    if (errors.length === 0) {
      showToast('success', '数据校验通过，可以导入')
    } else {
      showToast('error', `发现 ${errors.length} 个问题，请查看详情`)
    }
  }

  // 文件上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '')
      setJsonText(text)
      // 自动识别 mode
      try {
        const obj = JSON.parse(text)
        if (obj.mode === 'merge' || obj.mode === 'replace') {
          setImportMode(obj.mode)
        }
      } catch {
        // 解析失败不处理，等用户点导入时再报错
      }
    }
    reader.readAsText(file)
    // 重置 input 以便重复上传同一文件
    e.target.value = ''
  }

  // 下载 JSON 模板
  const handleDownloadTemplate = () => {
    const template = {
      mode: 'merge',
      students: [
        { id: 's001', name: '张伟', phone: '13800001001', grade: '高三' },
      ],
      schedules: [
        {
          id: 'c0001',
          studentId: 's001',
          courseName: '数学提高班',
          teacher: '张老师',
          location: 'A教室201',
          date: '2026-08-03',
          startTime: '09:00',
          endTime: '10:30',
          note: '',
        },
      ],
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-template.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // 删除单条排课
  const handleDeleteSchedule = async (schedule: Schedule) => {
    if (!confirm(`确认删除「${schedule.courseName}」(${schedule.date})？`)) return
    try {
      const result = await deleteSchedule(schedule.id, schedule.studentId, schedule.date)
      if (result.code === 0) {
        showToast('success', '排课已删除')
        if (selectedStudent) await loadSchedules(selectedStudent.id)
      } else {
        showToast('error', result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
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
        // 若当前选中的学员被删除，清空选择
        if (selectedStudent?.id === student.id) {
          setSelectedStudent(null)
          setSchedules([])
        }
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

  // 编辑保存后刷新
  const handleEditorUpdated = async () => {
    await loadStudents()
    if (selectedStudent) await loadSchedules(selectedStudent.id)
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
          jsonText={jsonText}
          setJsonText={setJsonText}
          importMode={importMode}
          setImportMode={setImportMode}
          fileInputRef={fileInputRef}
          onFileUpload={handleFileUpload}
          onDownloadTemplate={handleDownloadTemplate}
          onValidate={handleValidate}
          onImport={handleImport}
          validationResults={validationResults}
          setValidationResults={setValidationResults}
        />
        {/* 编辑/新增弹窗与 toast 仍在父级统一管理 */}
        <ScheduleEditor
          schedule={editingSchedule}
          students={students}
          onClose={() => setEditingSchedule(null)}
          onUpdated={handleEditorUpdated}
        />
        {addingSchedule && (
          <ScheduleEditor
            schedule={null}
            students={students}
            mode="add"
            onClose={() => setAddingSchedule(false)}
            onUpdated={handleEditorUpdated}
          />
        )}
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
              <span className="hidden sm:inline">返回日历</span>
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

        {/* 排课管理 */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 bg-brand-500 rounded"></span>
              排课管理
            </h2>
            <button
              onClick={() => setAddingSchedule(true)}
              disabled={busy || students.length === 0}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
              title={students.length === 0 ? '请先添加学员数据' : '新增单条排课'}
            >
              + 新增排课
            </button>
          </div>

          {/* 学员搜索 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <span className="text-sm text-slate-500">搜索学员：</span>
            <div className="w-full max-w-md">
              <SearchBar onSelectStudent={setSelectedStudent} />
            </div>
            {selectedStudent && (
              <span className="text-xs text-slate-400">
                当前：{selectedStudent.name} · 共 {schedules.length} 条排课
              </span>
            )}
          </div>

          {/* 排课列表 */}
          {!selectedStudent ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              请搜索并选择学员查看排课列表
            </div>
          ) : loadingSchedules ? (
            <div className="text-center py-10">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">该学员暂无排课</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
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
                      <td className="py-2.5 px-2 text-right">
                        <button
                          onClick={() => setEditingSchedule(s)}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(s)}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium"
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
              onClick={() => setShowAdvanced(true)}
              className="btn border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 text-sm"
            >
              进入进阶管理 →
            </button>
          </div>
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
        <ScheduleEditor
          schedule={null}
          students={students}
          mode="add"
          onClose={() => setAddingSchedule(false)}
          onUpdated={handleEditorUpdated}
        />
      )}
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
