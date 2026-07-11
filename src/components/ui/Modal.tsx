// 通用模态框外壳 —— 包装 shadcn/ui Dialog，保留原有 API（title/onClose/footer/size/beforeClose）
import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { X } from 'lucide-react'

interface ModalProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  // 关闭时是否拦截（如未保存提示）；返回 false 阻止关闭
  beforeClose?: () => boolean
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export function Modal({ title, onClose, children, footer, size = 'md', beforeClose }: ModalProps) {
  const handleClose = () => {
    if (beforeClose && !beforeClose()) return
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in-0 duration-150"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          handleClose()
        }
      }}
      tabIndex={-1}
    >
      <div
        className={cn(
          'bg-background rounded-lg shadow-lg w-full max-h-[90vh] flex flex-col animate-in fade-in-0 zoom-in-95 duration-150',
          SIZE[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-base text-foreground">{title}</h3>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 rounded-sm"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区：可滚动 */}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>

        {/* 底部操作 */}
        {footer && (
          <div className="px-5 py-3 bg-muted/50 border-t border-border flex justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
