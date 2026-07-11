// 全局确认对话框 —— 命令式调用，使用 shadcn/ui 语义色 + lucide 图标
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/utils/cn'
import { AlertTriangle, Info } from 'lucide-react'
import { inputClass } from './Field'

interface ConfirmOptions {
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  requireText?: string
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

let current: ConfirmState | null = null
let setter: ((s: ConfirmState | null) => void) | null = null

export function confirmDialog(opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    current = { ...opts, resolve }
    setter?.(current)
  })
}

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    setter = setState
    return () => {
      setter = null
    }
  }, [])

  useEffect(() => {
    setText('')
  }, [state])

  const close = useCallback(
    (ok: boolean) => {
      const s = state
      setState(null)
      current = null
      s?.resolve(ok)
    },
    [state],
  )

  useEffect(() => {
    if (!state) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [state, close])

  if (!state) return null

  const requireText = state.requireText
  const canConfirm = !requireText || text === requireText

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 animate-in fade-in-0 duration-150"
      onClick={() => close(false)}
    >
      <div
        className="bg-popover rounded-lg shadow-lg w-full max-w-sm overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部图标 + 标题 */}
        <div className="px-5 pt-5 pb-2 text-center">
          <div
            className={cn(
              'w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3',
              state.danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
            )}
          >
            {state.danger ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <Info className="w-6 h-6" />
            )}
          </div>
          <h3 className="font-semibold text-base text-foreground">
            {state.title || '确认'}
          </h3>
        </div>

        {/* 消息内容 */}
        {state.message && (
          <div className="px-5 pb-3 text-sm text-muted-foreground text-center whitespace-pre-line">
            {state.message}
          </div>
        )}

        {/* 要求输入确认文本 */}
        {requireText && (
          <div className="px-5 pb-3">
            <p className="text-xs text-muted-foreground mb-1.5 text-center">
              确认 <code className="px-1 py-0.5 bg-muted rounded text-foreground font-mono">{requireText}</code>
            </p>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className={cn(inputClass, 'text-center')}
            />
          </div>
        )}

        {/* 操作按钮 */}
        <div className="px-5 py-3 bg-muted/50 border-t border-border flex gap-2 justify-center">
          <button
            onClick={() => close(false)}
            className="btn-ghost flex-1"
          >
            {state.cancelText || '取消'}
          </button>
          <button
            onClick={() => close(true)}
            disabled={!canConfirm}
            className={cn(
              'btn flex-1 text-white disabled:opacity-40 disabled:cursor-not-allowed',
              state.danger ? 'bg-destructive hover:bg-rose-700' : 'bg-primary hover:bg-brand-600',
            )}
          >
            {state.confirmText || (state.danger ? '删除' : '确认')}
          </button>
        </div>
      </div>
    </div>
  )
}
