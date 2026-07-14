// 排课批量选择弹窗：修改排课时，先展示同班同时段的所有排课，操作员勾选后统一修改
// - 查询逻辑：按 classId + date 查同班同日排课，前端按 startTime/endTime 过滤同时段
// - 无同班排课（classId 为空或只有当前一条）时自动跳过，直接进入单条编辑
import { useEffect, useMemo, useState } from 'react'
import type { Schedule } from '@/types'
import { searchSchedules } from '@/api/admin'
import { Modal, ModalFooter } from '@/components/ui'
import { cn } from '@/utils/cn'

interface ScheduleBatchSelectProps {
  schedule: Schedule          // 当前点击的排课
  students: { id: string; name: string; grade?: string }[]
  onClose: () => void
  onConfirm: (selected: Schedule[]) => void   // 选中的排课（含当前这条）
}

export function ScheduleBatchSelect({
  schedule,
  students,
  onClose,
  onConfirm,
}: ScheduleBatchSelectProps) {
  const [loading, setLoading] = useState(true)
  const [sameSlotSchedules, setSameSlotSchedules] = useState<Schedule[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  // 查询同班同日同时段排课
  useEffect(() => {
    const load = async () => {
      // 无 classId → 直接单条编辑
      if (!schedule.classId) {
        onConfirm([schedule])
        return
      }
      try {
        setLoading(true)
        const result = await searchSchedules({
          classId: schedule.classId,
          startDate: schedule.date,
          endDate: schedule.date,
        })
        if (result.code === 0) {
          // 过滤同日同时段、非取消的排课
          const same = (result.data?.schedules || []).filter(
            (s) =>
              s.date === schedule.date &&
              (s.startTime || '') === (schedule.startTime || '') &&
              (s.endTime || '') === (schedule.endTime || '') &&
              s.status !== 'cancelled',
          )
          // 如果只有当前一条，直接进单条编辑
          if (same.length <= 1) {
            onConfirm([schedule])
            return
          }
          setSameSlotSchedules(same)
          // 默认全选
          setSelectedIds(new Set(same.map((s) => s.id)))
        } else {
          // 查询失败，回退到单条编辑
          onConfirm([schedule])
          return
        }
      } catch {
        onConfirm([schedule])
        return
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === sameSlotSchedules.length) return new Set()
      return new Set(sameSlotSchedules.map((s) => s.id))
    })
  }

  const selectedSchedules = useMemo(
    () => sameSlotSchedules.filter((s) => selectedIds.has(s.id)),
    [sameSlotSchedules, selectedIds],
  )

  const studentName = (id: string) => {
    const s = students.find((s) => s.id === id)
    return s?.name || id
  }

  const handleConfirm = () => {
    if (selectedSchedules.length === 0) {
      setError('请至少选择一条排课')
      return
    }
    onConfirm(selectedSchedules)
  }

  if (loading) {
    return (
      <Modal title={'同班排课加载中'} onClose={onClose} size="md">
        <div className="p-10 text-center text-sm text-muted-foreground/70">{'加载中…'}</div>
      </Modal>
    )
  }

  return (
    <Modal
      title={'选择要一起修改的排课'}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmDisabled={selectedSchedules.length === 0}
          cancelText={'取消'}
          confirmText={`修改选中 ${selectedSchedules.length} 条`}
        />
      }
    >
      <div className="space-y-3">
        {/* 说明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-700">
          检测到同班同时段（{schedule.date} {schedule.startTime}-{schedule.endTime}）共有{' '}
          {sameSlotSchedules.length} 条排课。勾选要一起修改的条目，修改时将统一应用新值。
        </div>

        {/* 全选 / 取消全选 */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={selectedIds.size === sameSlotSchedules.length}
              onChange={toggleAll}
              className="w-4 h-4"
            />
            <span className="text-muted-foreground">全选 / 取消全选</span>
          </label>
          <span className="text-xs text-muted-foreground/70">
            已选 {selectedIds.size} / {sameSlotSchedules.length}
          </span>
        </div>

        {/* 排课列表 */}
        <div className="border border-border rounded-md max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 px-3 font-medium w-10"></th>
                <th className="text-left py-2 px-3 font-medium">学员</th>
                <th className="text-left py-2 px-3 font-medium">课程</th>
                <th className="text-left py-2 px-3 font-medium">教师</th>
                <th className="text-left py-2 px-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {sameSlotSchedules.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    'border-b border-border/50 cursor-pointer transition-colors',
                    selectedIds.has(s.id) ? 'bg-primary/5' : 'hover:bg-muted/30',
                    s.id === schedule.id && 'font-medium',
                  )}
                >
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggle(s.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-foreground">{studentName(s.studentId)}</span>
                    {s.id === schedule.id && (
                      <span className="ml-1 text-xs text-primary">（当前）</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{s.courseName}</td>
                  <td className="py-2 px-3 text-muted-foreground">{s.teacher || '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {s.attended === true ? (
                      <span className="text-green-600">已到课</span>
                    ) : s.attended === false ? (
                      <span className="text-red-600">缺勤</span>
                    ) : s.status === 'makeup' ? (
                      <span className="text-blue-600">补课</span>
                    ) : (
                      <span>未点名</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 已点名提示 */}
        {sameSlotSchedules.some((s) => s.attended !== undefined && s.attended !== null) && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            ⚠ 已点名的排课不可修改，保存时将自动跳过
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
