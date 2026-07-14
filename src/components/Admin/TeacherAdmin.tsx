// 教师端管理页 —— 课后反馈 + 教师绩效 两个 Tab
import { useEffect, useRef, useState } from 'react'
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
  uploadFeedbackImage,
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
import { Plus, Check, ImagePlus, X, Loader2 } from 'lucide-react'

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
  // 编辑弹窗：图片列表、图片上传中标记、列表预览大图
  const [editImages, setEditImages] = useState<string[]>([])
  const [editUploading, setEditUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string>('')

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
    setEditImages(fb.images || [])
  }

  const closeEdit = () => {
    setEditing(null)
    setEditImages([])
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const result = await updateFeedback(editing.id, {
        content: editContent,
        rating: editRating,
        images: editImages,
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
                      {/* 图片缩略图行：最多显示前 4 张，超出显示 +N */}
                      {fb.images && fb.images.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {fb.images.slice(0, 4).map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt={`图片${idx + 1}`}
                              className="w-10 h-10 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setPreviewImage(url)}
                            />
                          ))}
                          {fb.images.length > 4 && (
                            <div className="w-10 h-10 rounded border border-border flex items-center justify-center text-xs text-muted-foreground bg-muted/50">
                              +{fb.images.length - 4}
                            </div>
                          )}
                        </div>
                      )}
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
              confirmDisabled={editUploading}
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
            <Field label={'图片'}>
              <FeedbackImageUploader
                feedbackId={editing.id}
                images={editImages}
                onChange={setEditImages}
                disabled={saving}
                onUploadingChange={setEditUploading}
              />
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

      {/* 图片预览大图遮罩：点击空白或关闭按钮关闭 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage('')}
        >
          <img
            src={previewImage}
            alt="预览"
            className="max-w-full max-h-full object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
            onClick={() => setPreviewImage('')}
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
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
  // 提交前暂存的图片文件（含本地预览 URL），提交时先创建反馈再上传
  const [pendingFiles, setPendingFiles] = useState<{ file: File; url: string }[]>([])
  const pendingInputRef = useRef<HTMLInputElement>(null)

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

  // 新增反馈时暂存图片：限制最多 9 张
  const addPendingFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const remaining = 9 - pendingFiles.length
    if (remaining <= 0) {
      toast.error('最多只能选 9 张图片')
      return
    }
    const arr = Array.from(files).slice(0, remaining)
    if (arr.length < Array.from(files).length) {
      toast.error(`最多只能选 9 张图片，已截取前 ${arr.length} 张`)
    }
    setPendingFiles([
      ...pendingFiles,
      ...arr.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ])
    if (pendingInputRef.current) pendingInputRef.current.value = ''
  }

  // 移除暂存图片并释放本地预览 URL
  const removePendingFile = (idx: number) => {
    const item = pendingFiles[idx]
    if (item) URL.revokeObjectURL(item.url)
    setPendingFiles(pendingFiles.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    if (!selected) {
      toast.error('请先选择一条排课记录')
      return
    }
    if (!content.trim()) {
      toast.error('反馈内容不能为空')
      return
    }
    if (content.length > 2000) {
      toast.error('反馈内容不能超过 2000 字')
      return
    }
    setSaving(true)
    try {
      // 第一步：先创建无图反馈，拿到 feedbackId
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
        images: [],
      })
      if (result.code !== 0) {
        toast.error(result.message || '提交失败')
        return
      }
      const newId = result.data?.id
      if (!newId) {
        toast.error('反馈已创建但未返回 id，图片未能上传')
        onCreated()
        return
      }
      // 第二步：如果用户选了图片，逐个上传
      if (pendingFiles.length > 0) {
        const uploadedUrls: string[] = []
        for (const item of pendingFiles) {
          try {
            const upRes = await uploadFeedbackImage(newId, item.file)
            if (upRes.code === 0 && upRes.data?.url) {
              uploadedUrls.push(upRes.data.url)
            } else {
              toast.error(upRes.message || `图片上传失败：${item.file.name}`)
            }
          } catch (e) {
            toast.error((e as Error).message || `图片上传失败：${item.file.name}`)
          }
        }
        // 第三步：把图片 url 写回反馈
        if (uploadedUrls.length > 0) {
          try {
            await updateFeedback(newId, { images: uploadedUrls })
          } catch (e) {
            toast.error((e as Error).message || '图片地址保存失败')
          }
        }
      }
      toast.success('反馈已提交')
      onCreated()
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

        <Field label={'反馈内容'} required>
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

        {/* 图片：提交前仅暂存 File 并显示本地预览，提交时先创建反馈再上传 */}
        <Field label={'图片'} hint="可选，最多 9 张，提交后上传">
          <div className="space-y-2">
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingFiles.map((item, idx) => (
                  <div key={idx} className="relative w-20 h-20 group">
                    <img
                      src={item.url}
                      alt={`预览${idx + 1}`}
                      className="w-20 h-20 object-cover rounded-md border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="删除图片"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pendingFiles.length < 9 && (
              <button
                type="button"
                onClick={() => pendingInputRef.current?.click()}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-border rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ImagePlus className="w-4 h-4" />
                添加图片
              </button>
            )}
            <input
              ref={pendingInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addPendingFiles(e.target.files)}
            />
          </div>
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

// ============ 可复用图片上传组件 ============
// 用于编辑反馈弹窗：已存在 feedbackId，逐张上传并把 url 追加到 images
function FeedbackImageUploader({
  feedbackId,
  images,
  onChange,
  disabled,
  onUploadingChange,
}: {
  feedbackId: string
  images: string[]
  onChange: (images: string[]) => void
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 逐张上传：成功后把 url 追加到 images，超过 9 张提示
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const remaining = 9 - images.length
    if (remaining <= 0) {
      toast.error('最多只能上传 9 张图片')
      return
    }
    const fileArr = Array.from(files).slice(0, remaining)
    if (fileArr.length < Array.from(files).length) {
      toast.error(`最多只能上传 9 张图片，已截取前 ${fileArr.length} 张`)
    }
    setUploading(true)
    onUploadingChange?.(true)
    const newUrls: string[] = []
    for (const file of fileArr) {
      try {
        const result = await uploadFeedbackImage(feedbackId, file)
        if (result.code === 0 && result.data?.url) {
          newUrls.push(result.data.url)
        } else {
          toast.error(result.message || `上传失败：${file.name}`)
        }
      } catch (e) {
        toast.error((e as Error).message || `上传失败：${file.name}`)
      }
    }
    if (newUrls.length > 0) {
      onChange([...images, ...newUrls])
      toast.success(`已上传 ${newUrls.length} 张图片`)
    }
    setUploading(false)
    onUploadingChange?.(false)
    // 清空 input，便于重复选择同一文件
    if (inputRef.current) inputRef.current.value = ''
  }

  // 删除图片：仅从 images 数组移除引用（物理文件不删）
  const removeImage = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {/* 当前图片缩略图网格，每张 80x80 圆角，hover 显示删除按钮 */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, idx) => (
            <div key={idx} className="relative w-20 h-20 group">
              <img
                src={url}
                alt={`图片${idx + 1}`}
                className="w-20 h-20 object-cover rounded-md border border-border"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="删除图片"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {/* 添加图片按钮：隐藏 file input，支持多选 */}
      {!disabled && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || images.length >= 9}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-border rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              上传中…
            </>
          ) : (
            <>
              <ImagePlus className="w-4 h-4" />
              添加图片
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {images.length >= 9 && !disabled && (
        <div className="text-xs text-muted-foreground/70">已达上限 9 张</div>
      )}
    </div>
  )
}
