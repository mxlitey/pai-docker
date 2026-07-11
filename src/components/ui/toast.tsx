// 全局 Toast —— 命令式调用，使用 shadcn/ui 语义色 + lucide 图标
// 用法：import { toast } from '@/components/ui'
//       toast.success('已保存') / toast.error('失败') / toast.info('提示') / toast.warning('注意')
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/utils/cn'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

let items: ToastItem[] = []
let listeners: Array<(items: ToastItem[]) => void> = []
let seq = 0

function emit() {
  for (const l of listeners) l(items)
}

function push(type: ToastType, message: string, duration = 3500) {
  const id = ++seq
  items = [...items, { id, type, message }]
  emit()
  if (duration > 0) {
    window.setTimeout(() => dismiss(id), duration)
  }
  return id
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

export const toast = {
  success: (msg: string, dur?: number) => push('success', msg, dur),
  error: (msg: string, dur?: number) => push('error', msg, dur),
  info: (msg: string, dur?: number) => push('info', msg, dur),
  warning: (msg: string, dur?: number) => push('warning', msg, dur),
  dismiss,
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 flex-shrink-0" />,
  error: <XCircle className="w-4 h-4 flex-shrink-0" />,
  info: <Info className="w-4 h-4 flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 flex-shrink-0" />,
}

const BORDER: Record<ToastType, string> = {
  success: 'border-l-green-500',
  error: 'border-l-rose-500',
  info: 'border-l-primary',
  warning: 'border-l-amber-500',
}

const ICON_COLOR: Record<ToastType, string> = {
  success: 'text-green-500',
  error: 'text-rose-500',
  info: 'text-primary',
  warning: 'text-amber-500',
}

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items)
  useEffect(() => {
    listeners.push(setList)
    return () => {
      listeners = listeners.filter((l) => l !== setList)
    }
  }, [])
  const handleDismiss = useCallback((id: number) => dismiss(id), [])
  if (list.length === 0) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg shadow-lg border border-l-4 border-border bg-popover text-popover-foreground text-sm animate-in fade-in-0 slide-in-from-top-4 duration-150',
            BORDER[t.type],
          )}
        >
          <span className={ICON_COLOR[t.type]}>{ICONS[t.type]}</span>
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => handleDismiss(t.id)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
