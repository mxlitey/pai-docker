// 教师端管理页 —— 课后反馈 + 教师绩效 两个 Tab
import { useEffect, useState } from 'react'
import type { ClassInfo, Feedback, TeacherPerformance, Schedule } from '@/types'
import {
  getFeedback,
  updateFeedback,
  deleteFeedback,
  addFeedback,
  searchSchedules,
  getTeacherPerformance,
  listClasses,
  getCurrentAdmin,
} from '@/api/admin'
import { todayLocal, currentMonthRangeLocal } from '@/utils/date'
import {
  Button,
  EmptyState,
  Field,
  Modal,
  ModalFooter,
  Pagination,
  SubPageHeader,
  LoadingBlock,
  inputClass,
  toast,
  confirmDialog,
} from '@/components/ui'
import { cn } from '@/utils/cn'
import { Plus, Check } from 'lucide-react'

interface TeacherAdminProps {
  onBack: () => void
}

type TabKey = 'feedback' | 'performance'

const FEEDBACK_PAGE_SIZE = 10

// 评分星标：rating 为 0-5，用 ★/☆ 渲染（小数先四舍五入）
function renderStars(rating: number): string {
  // rating 为 null/NaN 时返回空星，避免 '★'.repeat(NaN) 抛 RangeError 导致白屏
  if (rating == null || isNaN(rating)) return '☆☆☆☆☆'
  const r = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

// 文本截断（用于反馈内容预览）
function truncate(s: string, n = 30): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

const TAB_DEFS: { key: TabKey; labelKey: string }[] = [
  { key: 'feedback', labelKey: '课后反馈' },
  { key: 'performance', labelKey: '教师绩效' },
]

export function TeacherAdmin({ onBack }: TeacherAdminProps) {
  const [tab, setTab] = useState<TabKey>('feedback')

  return (
    <div className="min-h-full bg-background">
      <SubPageHeader title={'教师管理'} onBack={onBack} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Tab 切换 */}
        <div className="flex gap-1">
          {TAB_DEFS.map((tabDef) => {
            const active = tabDef.key === tab
            return (
              <button
                key={tabDef.key}
                onClick={() => setTab(tabDef.key)}
                className={cn(
                  'px-4 py-2 text-sm rounded-md whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-background text-muted-foreground border border-border hover:bg-muted/50',
                )}
              >
                {tabDef.labelKey}
              </button>
            )
          })}
        </div>

        {tab === 'feedback' ? <FeedbackPanel /> : <PerformancePanel />}
      </main>
    </div>
  )
}

// ============ Tab1：课后反馈 ============
function FeedbackPanel() {
  const [list, setList] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Feedback | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editRating, setEditRating] = useState(5)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)

  const totalPages = Math.max(1, Math.ceil(list.length / FEEDBACK_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * FEEDBACK_PAGE_SIZE
  const pageItems = list.slice(start, start + FEEDBACK_PAGE_SIZE)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getFeedback()
      setList(data)
    } catch (e) {
      toast.error((e as Error).message || '加载反馈失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openEdit = (fb: Feedback) => {
    setEditing(fb)
    setEditContent(fb.content || '')
    setEditRating(fb.rating ?? 5)
  }

  const closeEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const result = await updateFeedback(editing.id, {
        content: editContent,
        rating: editRating,
      })
      if (result.code === 0) {
        toast.success('反馈已更新')
        closeEdit()
        await load()
      } else {
        toast.error(result.message || '更新失败')
      }
    } catch (e) {
      toast.error((e as Error).message || '更新失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (fb: Feedback) => {
    const ok = await confirmDialog({
      title: '删除反馈',
      message: '确认删除该条课后反馈？',
      danger: true,
      confirmText: '确认',
    })
    if (!ok) return
    try {
      const result = await deleteFeedback(fb.id)
      if (result.code === 0) {
        toast.success('已删除')
        await load()
      } else {
        toast.error(result.message || '删除失败')
      }
    } catch (e) {
      toast.error((e as Error).message || '删除失败')
    }
  }

  return (
    <>
      {/* 操作栏 */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4 mr-1" />
          新增反馈
        </Button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyState title={'暂无课后反馈'} description="点击右上角「新增反馈」提交课后反馈" />
      ) : (
        <section className="card p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'日期'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'学员'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'课程'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'教师'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'评分'}</th>
                  <th className="text-left py-2 px-2 font-medium">{'反馈内容'}</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">{'操作'}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((fb) => (
                  <tr
                    key={fb.id}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{fb.date || '—'}</td>
                    <td className="py-2 px-2 text-foreground whitespace-nowrap">{fb.studentName || '—'}</td>
                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{fb.courseId || fb.teacherName || '—'}</td>
                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{fb.teacherName || '—'}</td>
                    <td className="py-2 px-2 text-amber-500 whitespace-nowrap" title={`${fb.rating} 星`}>
                      {renderStars(fb.rating)}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground max-w-xs" title={fb.content}>
                      {fb.content ? truncate(fb.content) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(fb)}
                        className="text-primary hover:text-primary text-xs"
                      >
                        {'编辑'}
                      </button>
                      <button
                        onClick={() => handleDelete(fb)}
                        className="text-destructive hover:text-destructive text-xs ml-3"
                      >
                        {'删除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={list.length}
            pageSize={FEEDBACK_PAGE_SIZE}
            onPageChange={setPage}
          />
        </section>
      )}

      {/* 编辑反馈弹窗 */}
      {editing && (
        <Modal
          title="编辑反馈"
          size="md"
          onClose={closeEdit}
          footer={
            <ModalFooter
              loading={saving}
              onCancel={closeEdit}
              onConfirm={saveEdit}
              confirmText={'保存'}
            />
          }
        >
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground/70">
              {editing.studentName || '—'} · {editing.date || '—'}
            </div>
            <Field label={'反馈内容'}>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="请输入课后反馈内容"
                className={cn(inputClass, 'resize-y')}
              />
            </Field>
            <Field label={'评分'}>
              <select
                value={editRating}
                onChange={(e) => setEditRating(Number(e.target.value))}
                className={inputClass}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} 星（{renderStars(n)}）
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {/* 新增反馈弹窗 */}
      {adding && (
        <AddFeedbackModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            load()
          }}
        />
      )}
    </>
  )
}

// ============ 新增反馈弹窗 ============
// 流程：选日期 → （可选）选班级 → 加载当天/该班级排课 → 选排课 → 填内容+评分 → 提交
// 教师/学员/课程/日期 等字段从选中排课自动填充
function AddFeedbackModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const today = todayLocal()
  const [date, setDate] = useState(today)
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [classId, setClassId] = useState('')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [content, setContent] = useState('')
  const [rating, setRating] = useState(5)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 加载班级列表（用于按班级过滤排课）
  useEffect(() => {
    let cancelled = false
    async function loadClasses() {
      try {
        const result = await listClasses()
        if (cancelled) return
        if (result.code === 0) {
          setClasses(result.data.classes || [])
        }
      } catch {
        // 班级加载失败不阻塞流程，按日期加载全部排课仍可用
      }
    }
    loadClasses()
    return () => {
      cancelled = true
    }
  }, [])

  const loadSchedules = async (d: string, cid: string) => {
    if (!d) {
      setSchedules([])
      setLoaded(false)
      return
    }
    setLoadingSchedules(true)
    setSelectedId('')
    try {
      const result = await searchSchedules({
        startDate: d,
        endDate: d,
        classId: cid || undefined,
      })
      if (result.code === 0) {
        setSchedules(result.data.schedules || [])
      } else {
        setSchedules([])
        toast.error(result.message || '加载排课失败')
      }
    } catch (e) {
      setSchedules([])
      toast.error((e as Error).message || '加载排课失败')
    } finally {
      setLoadingSchedules(false)
      setLoaded(true)
    }
  }

  useEffect(() => {
    loadSchedules(date, classId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, classId])

  const selected = schedules.find((s) => s.id === selectedId) || null

  const canSubmit = !!selected && !saving

  const handleSubmit = async () => {
    if (!selected) {
      toast.error('请先选择一条排课记录')
      return
    }
    setSaving(true)
    try {
      const result = await addFeedback({
        scheduleId: selected.id,
        courseId: selected.courseId || '',
        teacherId: '',
        teacherName: selected.teacher || '',
        studentId: selected.studentId,
        studentName: selected.studentName,
        date: selected.date,
        content,
        rating,
      })
      if (result.code === 0) {
        toast.success('反馈已提交')
        onCreated()
      } else {
        toast.error(result.message || '提交失败')
      }
    } catch (e) {
      toast.error((e as Error).message || '提交失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="新增课后反馈"
      size="md"
      onClose={onClose}
      footer={
        <ModalFooter
          loading={saving}
          onCancel={onClose}
          onConfirm={handleSubmit}
          confirmText="提交反馈"
          confirmDisabled={!canSubmit}
        />
      }
    >
      <div className="space-y-4">
        {/* 步骤提示 */}
        <div className="text-xs text-muted-foreground bg-background rounded p-2 leading-relaxed">
          ① 选择上课日期 → ② （可选）选择班级过滤 → ③ 从排课中选择一条 → ④ 填写反馈内容与评分 → ⑤ 提交
        </div>

        <Field label="上课日期">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
            className={inputClass}
          />
        </Field>

        <Field label="班级" hint="不选则显示该日期全部排课">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={inputClass}
          >
            <option value="">全部班级</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.courseName ? `（${c.courseName}）` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="选择排课">
          {loadingSchedules ? (
            <div className="text-sm text-muted-foreground/70 py-2">加载排课中…</div>
          ) : schedules.length === 0 ? (
            <div className="text-sm text-muted-foreground/70 py-2">
              {loaded ? '该条件下暂无排课记录' : '请先选择日期'}
            </div>
          ) : (
            <div className="border border-border rounded max-h-56 overflow-y-auto divide-y divide-border">
              {schedules.map((s) => {
                const active = s.id === selectedId
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2',
                      active ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {s.studentName || '—'}
                        <span className="ml-2 text-xs text-muted-foreground/70">
                          {s.startTime || '--:--'} ~ {s.endTime || '--:--'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground/70 truncate">
                        {s.courseName || '—'} · {s.teacher || '—'} · {s.location || '—'}
                      </div>
                    </div>
                    {active && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Field>

        {selected && (
          <div className="text-xs text-muted-foreground bg-primary/10 rounded p-2">
            已选：{selected.studentName} · {selected.courseName} · {selected.date}{' '}
            {selected.startTime}~{selected.endTime}
          </div>
        )}

        <Field label={'反馈内容'}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="请输入课后反馈内容（学习表现、掌握情况、改进建议等）"
            className={cn(inputClass, 'resize-y')}
          />
        </Field>

        <Field label={'评分'}>
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className={inputClass}
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} 星（{renderStars(n)}）
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

// ============ Tab2：教师绩效 ============
function PerformancePanel() {
  const [rows, setRows] = useState<TeacherPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const initMonth = currentMonthRangeLocal()
  const [startDate, setStartDate] = useState(initMonth.startDate)
  const [endDate, setEndDate] = useState(initMonth.endDate)
  // 查询触发器：点「查询」按钮自增；改日期不自动查
  const [queryTick, setQueryTick] = useState(0)

  // 当前登录用户：教师角色只显示自己的绩效，超管/管理员显示全部
  const currentAdmin = getCurrentAdmin()
  const isTeacher = currentAdmin?.role === 'teacher'
  // 教师姓名优先用 realName，回退到 username
  const teacherName = isTeacher
    ? currentAdmin?.realName || currentAdmin?.username || ''
    : ''

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await getTeacherPerformance({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          teacher: isTeacher ? teacherName || undefined : undefined,
        })
        if (cancelled) return
        setRows(data)
      } catch (e) {
        if (cancelled) return
        toast.error((e as Error).message || '加载绩效失败')
        setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // startDate/endDate 故意不列入依赖：改日期不自动查询
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTick])

  const handleQuery = () => setQueryTick((t) => t + 1)

  return (
    <>
      {/* 日期筛选区 */}
      <section className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 w-40">
            <span className="text-xs text-muted-foreground">{'开始日期'}</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 w-40">
            <span className="text-xs text-muted-foreground">{'结束日期'}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <Button variant="primary" loading={loading} onClick={handleQuery}>
            {'查询'}
          </Button>
        </div>
        {/* 教师角色仅显示本人绩效提示 */}
        {isTeacher && (
          <div className="mt-3 text-xs text-muted-foreground">
            {'当前为教师视角，仅显示您本人（' + teacherName + '）的绩效数据'}
          </div>
        )}
      </section>

      {/* 结果区 */}
      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={'暂无绩效数据'} description="尝试调整日期范围后重新查询" />
      ) : (
        <section className="card p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'教师'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'排课数'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'到课数'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'到课率'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'平均评分'}</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">{'反馈数'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const sc = row.schedule_count || 0
                  const ac = row.attended_count || 0
                  const rate = sc > 0 ? `${((ac / sc) * 100).toFixed(1)}%` : '—'
                  return (
                    <tr
                      key={row.teacher_id || row.teacher_name}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-2 px-2 text-foreground whitespace-nowrap">{row.teacher_name || '—'}</td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{sc}</td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{ac}</td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{rate}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {row.avg_rating == null || isNaN(row.avg_rating) ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : (
                          <span className="text-amber-500" title={row.avg_rating.toFixed(1)}>
                            {renderStars(row.avg_rating)}
                            <span className="ml-1 text-muted-foreground/70">({row.avg_rating.toFixed(1)})</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{row.feedback_count || 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
