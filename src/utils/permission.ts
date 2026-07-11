// 前端权限工具：解析当前用户有效权限，供后台菜单按权限隐藏
import type { CurrentAdmin } from '@/types'

// 角色默认权限（与后端 ROLE_PERMISSIONS 保持一致，前端用于菜单可见性判断）
// superadmin 通配；admin/teacher 默认权限点。注意：这里只列模块级 view 权限用于菜单显隐，
// 细粒度操作权限由后端 requirePermission 兜底校验。
export const ROLE_DEFAULT_VIEW_PERMISSIONS: Record<string, string[]> = {
  superadmin: [],
  admin: [
    'students:view', 'courses:view', 'grades:view', 'enrollments:view', 'transfers:view',
    'schedules:view', 'attendance:view', 'teachers:view', 'feedback:view',
    'announcement:view',
    'reports:view', 'dashboard:view', 'settings:manage', 'admins:view', 'audit:view',
  ],
  teacher: [
    'schedules:view', 'attendance:view', 'enrollments:view', 'students:view',
    'courses:view', 'grades:view', 'reports:view', 'feedback:view', 'teachers:view',
  ],
}

// 解析当前用户的有效权限点数组
// - superadmin：返回 null（表示全部拥有，用于菜单全显）
// - 其他：若 permissions 非空用自定义，否则用角色默认
export function resolvePermissions(admin: CurrentAdmin | null): string[] | null {
  if (!admin) return []
  if (admin.role === 'superadmin') return null
  const custom = (admin.permissions || '').trim()
  if (custom) {
    return custom.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return ROLE_DEFAULT_VIEW_PERMISSIONS[admin.role] || []
}

// 判断当前用户是否拥有指定权限
export function hasPermission(admin: CurrentAdmin | null, permission: string): boolean {
  const perms = resolvePermissions(admin)
  if (perms === null) return true
  return perms.includes(permission)
}

// 判断模块是否可见（菜单入口显隐）
// permission 传模块的 view 权限点，如 'students:view'
export function canSeeModule(admin: CurrentAdmin | null, permission: string): boolean {
  return hasPermission(admin, permission)
}
