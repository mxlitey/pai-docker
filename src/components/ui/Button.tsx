// 统一按钮组件 —— 包装 shadcn/ui Button，保留原有 API（variant/loading）
// 变体映射：primary→default, danger→destructive, ghost→ghost, outline→outline
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Spinner } from './Loading'

type Variant = 'primary' | 'ghost' | 'danger' | 'outline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  children: ReactNode
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-brand-600',
  ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:bg-rose-700',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
}

export function Button({ variant = 'primary', loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 px-4 py-2 h-9',
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {loading && <Spinner className="w-3.5 h-3.5 mr-1.5" />}
      {children}
    </button>
  )
}
