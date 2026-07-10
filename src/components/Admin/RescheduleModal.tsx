import { useState, useEffect } from 'react'
import type { Schedule, ScheduleChange } from '@/types'
import { rescheduleSchedule, makeupSchedule, listScheduleChanges } from '@/api/admin'
import { Modal, ModalFooter, inputClass } from '@/components/ui'

interface RescheduleModalProps {
  schedule: Schedule | null
  onClose: () => void
  onUpdated: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

export function RescheduleModal({ schedule, onClose, onUpdated, onToast }: RescheduleModalProps) {
  const [newDate, setNewDate] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
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

  if (!schedule) return null

  // 上下文感知：attended===false 为补课模式，其他为调课模式
  const isMakeupMode = schedule.attended === false
  const modeLabel = isMakeupMode ? '补课' : '调课'

  const handleSubmit = async () => {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      onToast('error', '请填写有效的新日期')
      return
    }
    // 校验：新日期/时间与原排课不能完全相同
    if (
      newDate === schedule.date &&
      (newStartTime || schedule.startTime || '') === (schedule.startTime || '') &&
      (newEndTime || schedule.endTime || '') === (schedule.endTime || '')
    ) {
      onToast('error', `新日期/时间与原排课相同，无需${modeLabel}`)
      return
    }

    setSaving(true)
    try {
      const result = isMakeupMode
        ? await makeupSchedule(
            schedule.id,
            newDate,
            newStartTime || undefined,
            newEndTime || undefined,
            reason || undefined,
          )
        : await rescheduleSchedule(
            schedule.id,
            newDate,
            newStartTime || undefined,
            newEndTime || undefined,
            reason || undefined,
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
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 space-y-1">
          <div className="text-xs text-slate-400 mb-1">原排课{isMakeupMode ? '（缺勤）' : ''}</div>
          <div className="text-sm text-slate-700 font-medium">
            {schedule.studentName} · {schedule.courseName}
          </div>
          <div className="text-sm text-slate-600">
            {schedule.date}
            {schedule.startTime ? ` ${schedule.startTime}` : ''}
            {schedule.endTime ? `-${schedule.endTime}` : ''}
          </div>
          {schedule.teacher && (
            <div className="text-xs text-slate-500">教师：{schedule.teacher}</div>
          )}
        </div>

        {/* 调课历史（仅调课模式显示，补课不写 schedule_changes） */}
        {!isMakeupMode && (loadingChanges || changes.length > 0) && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400">调课历史（{changes.length}）</div>
            {loadingChanges ? (
              <div className="text-xs text-slate-400">加载中…</div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {changes.map((c) => (
                  <div
                    key={c.id}
                    className="text-xs bg-amber-50 border border-amber-100 rounded px-3 py-2 text-slate-600"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 line-through">
                        {c.beforeDate} {c.beforeStartTime || ''}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="text-slate-700 font-medium">
                        {c.afterDate} {c.afterStartTime || ''}
                      </span>
                    </div>
                    {c.reason && (
                      <div className="mt-0.5 text-slate-500">原因：{c.reason}</div>
                    )}
                    {c.createdAt && (
                      <div className="mt-0.5 text-slate-400">{c.createdAt}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 新时间表单 */}
        <div className="space-y-3 pt-2">
          <div className="text-sm text-slate-400">{isMakeupMode ? '补课时间' : '调至新时间'}</div>

          {/* 新日期 */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0">
              <span className="text-rose-500 mr-0.5">*</span>新日期
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
            <span className="text-sm text-slate-400 w-20 flex-shrink-0">新时间</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                className={inputClass}
              />
              <span className="text-slate-400">-</span>
              <input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* 原因 */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0">{isMakeupMode ? '补课说明' : '调课原因'}</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
              placeholder={isMakeupMode ? '选填' : '选填，如：教师请假、场地冲突'}
            />
          </div>
        </div>

        {/* 说明 */}
        <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-xs text-blue-700">
          {isMakeupMode
            ? '补课后，原缺勤排课保留记录，新排课以新时间生成并标记为「补课」。新排课点名到课时会扣减课时。'
            : '调课后，原排课标记为「已取消」并保留记录，新排课以新时间生成。已点名的排课不允许调课（需先改缺勤回退课时）。'}
        </div>
      </div>
    </Modal>
  )
}
