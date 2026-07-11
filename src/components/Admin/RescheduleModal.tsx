import { useState, useEffect, useMemo } from 'react'
import type { Schedule, ScheduleChange, Course, ClassInfo } from '@/types'
import { rescheduleSchedule, makeupSchedule, listScheduleChanges } from '@/api/admin'
import { Modal, ModalFooter, inputClass } from '@/components/ui'
import { cn } from '@/utils/cn'

interface RescheduleModalProps {
  schedule: Schedule | null
  courses: Course[]
  classes: ClassInfo[]
  onClose: () => void
  onUpdated: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

export function RescheduleModal({ schedule, courses, classes, onClose, onUpdated, onToast }: RescheduleModalProps) {
  const [newDate, setNewDate] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  // 插班字段：课程/班级/老师/地点，默认沿用原排课
  const [newCourseId, setNewCourseId] = useState('')
  const [newClassId, setNewClassId] = useState('')
  const [newTeacher, setNewTeacher] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [changes, setChanges] = useState<ScheduleChange[]>([])
  const [loadingChanges, setLoadingChanges] = useState(false)

  // 弹窗打开时初始化表单 + 加载调课历史
  useEffect(() => {
    if (!schedule) return
    setNewDate(schedule.date)
    setNewStartTime(schedule.startTime || '')
    setNewEndTime(schedule.endTime || '')
    setNewCourseId(schedule.courseId || '')
    setNewClassId(schedule.classId || '')
    setNewTeacher(schedule.teacher || '')
    setNewLocation(schedule.location || '')
    setReason('')
    setChanges([])
    // 加载该排课的调课历史
    setLoadingChanges(true)
    listScheduleChanges({ scheduleId: schedule.id })
      .then((result) => {
        if (result.code === 0) {
          setChanges(result.data.changes)
        }
      })
      .catch(() => {
        // 加载失败不阻塞
      })
      .finally(() => setLoadingChanges(false))
  }, [schedule])

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === newCourseId) || null,
    [courses, newCourseId],
  )

  // 当前课程下的班级列表（未选课程时展示全部）
  const classOptions = useMemo(() => {
    if (!newCourseId) return classes
    return classes.filter((c) => !c.courseId || c.courseId === newCourseId)
  }, [classes, newCourseId])

  // 是否有插班字段被改动（与原排课对比）
  const insertChanged = useMemo(() => {
    if (!schedule) return false
    return (
      newTeacher !== (schedule.teacher || '') ||
      newCourseId !== (schedule.courseId || '') ||
      newClassId !== (schedule.classId || '') ||
      newLocation !== (schedule.location || '')
    )
  }, [schedule, newTeacher, newCourseId, newClassId, newLocation])

  if (!schedule) return null

  // 上下文感知：attended===false 为补课模式，其他为调课模式
  const isMakeupMode = schedule.attended === false
  const modeLabel = isMakeupMode ? '补课' : '调课'

  // 选课程：课程已不带 teacher/location/默认时间（已迁移至班级），仅维护课程与班级的联动
  const handleCourseChange = (nextCourseId: string) => {
    setNewCourseId(nextCourseId)
    // 切课程后若当前班级不属于该课程，清空班级（保留教师/地点/时间供用户手填）
    if (newClassId) {
      const cls = classes.find((c) => c.id === newClassId)
      if (cls && cls.courseId && cls.courseId !== nextCourseId) {
        setNewClassId('')
      }
    }
  }

  // 选班级：自动带入班级关联课程 + 老师/地点/时间
  const handleClassChange = (nextClassId: string) => {
    setNewClassId(nextClassId)
    if (!nextClassId) return
    const cls = classes.find((c) => c.id === nextClassId)
    if (!cls) return
    // 自动带入班级关联的课程
    if (cls.courseId && cls.courseId !== newCourseId) {
      setNewCourseId(cls.courseId)
    }
    if (cls.teacher) setNewTeacher(cls.teacher)
    if (cls.location) setNewLocation(cls.location)
    if (cls.defaultStartTime) setNewStartTime(cls.defaultStartTime)
    if (cls.defaultEndTime) setNewEndTime(cls.defaultEndTime)
  }

  const handleSubmit = async () => {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      onToast('error', '请填写有效的新日期')
      return
    }
    // 校验：新日期/时间与原排课相同且未改插班字段 → 无需操作
    const timeSame =
      newDate === schedule.date &&
      (newStartTime || schedule.startTime || '') === (schedule.startTime || '') &&
      (newEndTime || schedule.endTime || '') === (schedule.endTime || '')
    if (timeSame && !insertChanged) {
      onToast('error', `新日期/时间与原排课相同，无需${modeLabel}`)
      return
    }

    // 构造插班参数：仅传被改动的字段（与原排课不同的才传，避免无谓覆盖）
    const insertOpts: {
      newTeacher?: string
      newCourseId?: string
      newCourseName?: string
      newClassId?: string
      newLocation?: string
      newColor?: string
    } = {}
    if (newTeacher !== (schedule.teacher || '')) insertOpts.newTeacher = newTeacher
    if (newCourseId !== (schedule.courseId || '')) {
      insertOpts.newCourseId = newCourseId
      insertOpts.newCourseName = selectedCourse?.name || ''
      if (selectedCourse?.color) insertOpts.newColor = selectedCourse.color
    }
    if (newClassId !== (schedule.classId || '')) insertOpts.newClassId = newClassId
    if (newLocation !== (schedule.location || '')) insertOpts.newLocation = newLocation

    setSaving(true)
    try {
      const result = isMakeupMode
        ? await makeupSchedule(
            schedule.id,
            newDate,
            newStartTime || undefined,
            newEndTime || undefined,
            reason || undefined,
            Object.keys(insertOpts).length > 0 ? insertOpts : undefined,
          )
        : await rescheduleSchedule(
            schedule.id,
            newDate,
            newStartTime || undefined,
            newEndTime || undefined,
            reason || undefined,
            Object.keys(insertOpts).length > 0 ? insertOpts : undefined,
          )
      if (result.code === 0) {
        onToast('success', `已${modeLabel}：${schedule.date} → ${newDate}`)
        onUpdated()
        onClose()
      } else {
        onToast('error', result.message)
      }
    } catch (e) {
      onToast('error', '请求失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // 原排课信息展示
  const origCourseName = schedule.courseName || courses.find((c) => c.id === schedule.courseId)?.name || ''

  return (
    <Modal
      title={modeLabel}
      onClose={onClose}
      size="md"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSubmit}
          loading={saving}
          confirmText={`确认${modeLabel}`}
        />
      }
    >
      <div className="space-y-4">
        {/* 原排课信息 */}
        <div className="bg-background border border-border rounded-lg px-4 py-3 space-y-1">
          <div className="text-xs text-muted-foreground/70 mb-1">原排课{isMakeupMode ? '（缺勤）' : ''}</div>
          <div className="text-sm text-foreground font-medium">
            {schedule.studentName} · {origCourseName}
          </div>
          <div className="text-sm text-muted-foreground">
            {schedule.date}
            {schedule.startTime ? ` ${schedule.startTime}` : ''}
            {schedule.endTime ? `-${schedule.endTime}` : ''}
          </div>
          {(schedule.teacher || schedule.location) && (
            <div className="text-xs text-muted-foreground">
              {schedule.teacher ? `教师：${schedule.teacher}` : ''}
              {schedule.teacher && schedule.location ? ' · ' : ''}
              {schedule.location ? `地点：${schedule.location}` : ''}
            </div>
          )}
        </div>

        {/* 调课历史（仅调课模式显示，补课不写 schedule_changes） */}
        {!isMakeupMode && (loadingChanges || changes.length > 0) && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground/70">调课历史（{changes.length}）</div>
            {loadingChanges ? (
              <div className="text-xs text-muted-foreground/70">加载中…</div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {changes.map((c) => (
                  <div
                    key={c.id}
                    className="text-xs bg-amber-50 border border-amber-100 rounded px-3 py-2 text-muted-foreground"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground/70 line-through">
                        {c.beforeDate} {c.beforeStartTime || ''}
                      </span>
                      <span className="text-muted-foreground/70">→</span>
                      <span className="text-foreground font-medium">
                        {c.afterDate} {c.afterStartTime || ''}
                      </span>
                    </div>
                    {c.reason && (
                      <div className="mt-0.5 text-muted-foreground">原因：{c.reason}</div>
                    )}
                    {c.createdAt && (
                      <div className="mt-0.5 text-muted-foreground/70">{c.createdAt}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 新时间表单 */}
        <div className="space-y-3 pt-2">
          <div className="text-sm text-muted-foreground/70">{isMakeupMode ? '补课时间' : '调至新时间'}</div>

          {/* 新日期 */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0">
              <span className="text-destructive mr-0.5">*</span>新日期
            </span>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* 新时间 */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0">新时间</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                className={inputClass}
              />
              <span className="text-muted-foreground/70">-</span>
              <input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* 插班设置：可选改课程/班级/老师/地点 */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground/70">插班设置</div>
            <div className="text-xs text-muted-foreground/70">
              {insertChanged ? '已调整课程/班级/老师/地点' : '默认沿用原排课，可按需调整'}
            </div>
          </div>

          {/* 课程 */}
          {courses.length > 0 && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0">课程</span>
              <select
                value={newCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className={cn(inputClass, 'bg-background')}
              >
                <option value="">不指定课程</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.grade ? ` · ${c.grade}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 班级 */}
          {classes.length > 0 && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0">班级</span>
              <select
                value={newClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                className={cn(inputClass, 'bg-background')}
              >
                <option value="">不指定班级</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.memberCount ? ` · ${c.memberCount}人` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 老师 */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0">教师</span>
            <input
              type="text"
              value={newTeacher}
              onChange={(e) => setNewTeacher(e.target.value)}
              className={inputClass}
              placeholder="选填"
            />
          </div>

          {/* 地点 */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0">地点</span>
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              className={inputClass}
              placeholder="选填"
            />
          </div>
        </div>

        {/* 原因 */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground/70 w-20 flex-shrink-0">{isMakeupMode ? '补课说明' : '调课原因'}</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder={isMakeupMode ? '选填' : '选填，如：教师请假、场地冲突'}
          />
        </div>

        {/* 说明 */}
        <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-xs text-blue-700">
          {isMakeupMode
            ? '补课后，原缺勤排课保留记录，新排课以新时间生成并标记为「补课」。新排课点名到课时会扣减课时。'
            : '调课后，原排课标记为「已取消」并保留记录，新排课以新时间生成。已点名的排课不允许调课（需先改缺勤回退课时）。'}
          {insertChanged && ' 本次已调整课程/班级/老师/地点，新排课将按调整后的信息生成。'}
        </div>
      </div>
    </Modal>
  )
}
