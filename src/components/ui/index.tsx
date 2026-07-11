// UI 基础组件库 —— 统一交互设计 + shadcn/ui 组件
// 在应用根挂载一次 <UIHost/> 即可启用全局 Toast / Confirm
export { toast, ToastHost } from './toast'
export { confirmDialog, ConfirmHost } from './confirm'
export { Modal } from './Modal'
export { Pagination } from './Pagination'
export { EmptyState } from './EmptyState'
export { Spinner, Loading, LoadingBlock, LoadingFullscreen, ErrorBlock } from './Loading'
export { SubPageHeader } from './SubPageHeader'
export { Field, inputClass } from './Field'
export { Button } from './Button'

// shadcn/ui 组件（Button 除外，已有兼容版；其余按名导出避免冲突）
export { Input, type InputProps } from './shadcn/input'
export { Textarea, type TextareaProps } from './shadcn/textarea'
export { Label } from './shadcn/label'
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './shadcn/card'
export { Badge, badgeVariants, type BadgeProps } from './shadcn/badge'
export {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption,
} from './shadcn/table'
export { Separator } from './shadcn/separator'
export {
  Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from './shadcn/dialog'

import { ToastHost } from './toast'
import { ConfirmHost } from './confirm'
import { Button } from './Button'

// 全局宿主：挂载一次即可启用 toast / confirmDialog 命令式调用
export function UIHost() {
  return (
    <>
      <ToastHost />
      <ConfirmHost />
    </>
  )
}

// 统一「确认/取消」底部按钮组（配合 Modal 的 footer 使用）
export function ModalFooter({
  onCancel,
  onConfirm,
  cancelText,
  confirmText,
  loading = false,
  danger = false,
  confirmDisabled = false,
}: {
  onCancel: () => void
  onConfirm: () => void
  cancelText?: string
  confirmText?: string
  loading?: boolean
  danger?: boolean
  confirmDisabled?: boolean
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel} disabled={loading}>
        {cancelText ?? '取消'}
      </Button>
      <Button
        variant={danger ? 'danger' : 'primary'}
        onClick={onConfirm}
        loading={loading}
        disabled={confirmDisabled}
      >
        {loading ? '保存中…' : (confirmText ?? '保存')}
      </Button>
    </>
  )
}
