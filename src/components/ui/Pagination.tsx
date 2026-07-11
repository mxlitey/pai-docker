// 统一分页组件 —— 首末页 + 当前页前后 2 页，其余省略
// 使用 shadcn/ui 语义色
import { cn } from '@/utils/cn'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  total?: number
  pageSize?: number
}

export function Pagination({ page, totalPages, onPageChange, total, pageSize }: PaginationProps) {
  if (totalPages <= 1) {
    if (total !== undefined && pageSize !== undefined) {
      return (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">共 {total} 条</span>
          <span className="text-xs text-muted-foreground/60">第 1 / 1 页</span>
        </div>
      )
    }
    return null
  }

  const buttons: (number | '...')[] = []
  const around = 2
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - around && i <= page + around)) {
      buttons.push(i)
    } else if (buttons[buttons.length - 1] !== '...') {
      buttons.push('...')
    }
  }

  const btnClass = 'btn-ghost border border-border text-xs py-1 px-2.5'

  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {total !== undefined && pageSize !== undefined
          ? `共 ${total} 条 · 第 ${page} / ${totalPages} 页`
          : `第 ${page} / ${totalPages} 页 · 每页 ${pageSize ?? ''} 条`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={cn(btnClass, 'disabled:opacity-40 disabled:cursor-not-allowed')}
        >
          上一页
        </button>
        {buttons.map((b, idx) =>
          b === '...' ? (
            <span key={`e${idx}`} className="text-muted-foreground text-xs px-1.5 select-none">
              …
            </span>
          ) : (
            <button
              key={b}
              onClick={() => onPageChange(b)}
              className={cn(
                'text-xs py-1 px-2.5 rounded-md transition-colors',
                b === page
                  ? 'btn-primary'
                  : 'btn-ghost border border-border',
              )}
            >
              {b}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={cn(btnClass, 'disabled:opacity-40 disabled:cursor-not-allowed')}
        >
          下一页
        </button>
      </div>
    </div>
  )
}
