// 表单字段外壳 —— 统一 label + 控件 + 提示 + 错误 的布局
// 使用 shadcn/ui 语义色变量
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface FieldProps {
  label: string
  required?: boolean
  hint?: ReactNode
  error?: string
  // label 宽度，默认 w-20
  labelWidth?: string
  children: ReactNode
  className?: string
}

// 统一的输入框样式常量，映射 shadcn/ui Input 样式
// 不用 py-1：h-9 已固定高度，py 会压缩 date input 的 calendar indicator 导致溢出
export const inputClass =
  'w-full h-9 px-3 text-sm border border-input bg-transparent rounded-md shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50'

export function Field({ label, required, hint, error, labelWidth = 'w-20', children, className }: FieldProps) {
  return (
    <div className={cn('flex items-start gap-4', className)}>
      <span className={cn('text-sm text-muted-foreground flex-shrink-0 pt-2', labelWidth)}>
        {required && <span className="text-destructive mr-0.5">*</span>}
        {label}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        {children}
        {hint && !error && <div className="text-xs text-muted-foreground/70">{hint}</div>}
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
    </div>
  )
}
