// 后台二级页面工具栏：计数 + 操作区
// 标题与返回由后台统一面包屑页眉展示，此处仅保留页面内操作栏
import type { ReactNode } from 'react'

interface SubPageHeaderProps {
  title?: string
  onBack?: () => void
  backLabel?: string
  count?: number
  countLabel?: string
  className?: string
  children?: ReactNode
}

export function SubPageHeader({
  count,
  countLabel,
  className = 'max-w-5xl mx-auto px-4 pt-4',
  children,
}: SubPageHeaderProps) {
  // 无计数且无操作区时不渲染
  if (count === undefined && !children) return null

  return (
    <div className={`${className} flex items-center gap-3`}>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">
          共 {count} {countLabel ?? '条'}
        </span>
      )}
      {children && <div className="flex items-center gap-3 flex-shrink-0 ml-auto">{children}</div>}
    </div>
  )
}
