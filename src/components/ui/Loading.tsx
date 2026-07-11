// 统一加载状态组件 —— 使用 shadcn/ui 语义色
import { cn } from '@/utils/cn'
import { Loader2, AlertTriangle } from 'lucide-react'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className || 'w-4 h-4 text-primary')} />
}

export function Loading({ label = '加载中…' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </span>
  )
}

export function LoadingBlock({ label = '加载中…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('card p-16 flex flex-col items-center justify-center', className)}>
      <Spinner className="w-8 h-8 mb-3" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

export function LoadingFullscreen({ label = '初始化中…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Spinner />
        {label}
      </div>
    </div>
  )
}

// 错误块：统一错误展示，带重试按钮
export function ErrorBlock({
  message = '加载失败',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="card p-16 flex flex-col items-center justify-center">
      <div className="text-destructive mb-2">
        <AlertTriangle className="w-10 h-10" />
      </div>
      <p className="text-sm text-destructive mb-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost text-xs mt-2 border border-border">
          重试
        </button>
      )}
    </div>
  )
}
