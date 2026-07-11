// 后台二级页面统一外壳：返回 + 面包屑 + 标题 + 计数 + 操作区
// 使用 shadcn/ui 语义色 + lucide 图标
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

interface SubPageHeaderProps {
  title: string
  onBack: () => void
  backLabel?: string
  count?: number
  countLabel?: string
  children?: ReactNode
}

export function SubPageHeader({
  title,
  onBack,
  backLabel,
  count,
  countLabel,
  children,
}: SubPageHeaderProps) {
  return (
    <header className="bg-background border-b border-border sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            {backLabel ?? '返回后台'}
          </button>
          <span className="text-border flex-shrink-0">/</span>
          <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground hidden sm:block flex-shrink-0">
              共 {count} {countLabel ?? '条'}
            </span>
          )}
        </div>
        {children && <div className="flex items-center gap-3 flex-shrink-0">{children}</div>}
      </div>
    </header>
  )
}
