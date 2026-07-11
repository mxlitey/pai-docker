// 统一空状态 —— 图标 + 标题 + 描述 + 可选操作
// 使用 shadcn/ui 语义色 + lucide 图标
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn('card p-10 text-center', className)}>
      <div className="flex flex-col items-center">
        <div className="text-muted-foreground/40 mb-3">
          {icon || <Inbox className="w-14 h-14 opacity-50" />}
        </div>
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}
