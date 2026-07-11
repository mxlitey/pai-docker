// 鉴权工具 —— 基于 HMAC-SHA256 的带主体 token 签发与验证 + RBAC 权限模型
// token 格式: base64url(payload_json) + "." + hex(HMAC-SHA256(secret, payload_b64))
//   payload = { uid, username, role, realName, ts }
//
// 鉴权模型（admins 表 + RBAC）：
// - 管理员账号存于 admins 表（TEXT id，前缀 adm_），PBKDF2 哈希
// - admins 表为空时进入"引导创建超管"流程
// - 三级角色：superadmin（全部）/ admin（业务全权）/ teacher（受限）
// - token 携带主体标识，requireAuth 解析后注入 context.admin，供审计与权限校验

import {
  countAdmins,
  getAdminByUsername,
  getAdminById,
  createSuperAdmin,
} from './store.js'
import { getTokenSecret as getTokenSecretFromConfig } from './config-file.js'

// re-export，供 api 层直接从 auth.js 引入
export { createSuperAdmin }

// ========== 角色 / 权限模型 ==========
// 模块：students/courses/enrollments/transfers/schedules/attendance/announcement
//       reports/admins/audit/settings/feedback/dashboard/teachers
// 操作：view/create/update/delete（settings 用 manage）
// 权限串格式 "module:action"，superadmin 用 "*" 通配
// 自定义权限：admins.permissions 字段存逗号分隔串，非空时覆盖角色默认权限
export const ROLE_PERMISSIONS = {
  superadmin: '*',
  admin: [
    'students:view', 'students:create', 'students:update', 'students:delete',
    'courses:view', 'courses:create', 'courses:update', 'courses:delete',
    'grades:view', 'grades:create', 'grades:update', 'grades:delete',
    'classes:view', 'classes:create', 'classes:update', 'classes:delete',
    'enrollments:view', 'enrollments:create', 'enrollments:update', 'enrollments:delete',
    'transfers:view', 'transfers:create',
    'accounts:view',
    'schedules:view', 'schedules:create', 'schedules:update', 'schedules:delete', 'schedules:reschedule',
    'attendance:view', 'attendance:update',
    'announcement:view', 'announcement:update',
    'reports:view',
    'settings:manage',
    'feedback:view', 'feedback:create', 'feedback:update', 'feedback:delete',
    'teachers:view',
  ],
  teacher: [
    'schedules:view', 'schedules:reschedule', 'attendance:view', 'attendance:update',
    'enrollments:view', 'students:view', 'courses:view', 'grades:view', 'classes:view',
    'feedback:view', 'feedback:create', 'feedback:update',
  ],
}

// 权限定义清单：供前端渲染权限矩阵
// 每个模块含 label + 可分配的操作权限点
export const PERMISSION_DEFINITIONS = [
  { module: 'students', label: '学员管理', actions: [
    { key: 'students:view', label: '查看' },
    { key: 'students:create', label: '新增' },
    { key: 'students:update', label: '编辑' },
    { key: 'students:delete', label: '删除' },
  ]},
  { module: 'courses', label: '课程管理', actions: [
    { key: 'courses:view', label: '查看' },
    { key: 'courses:create', label: '新增' },
    { key: 'courses:update', label: '编辑' },
    { key: 'courses:delete', label: '删除' },
  ]},
  { module: 'grades', label: '年级管理', actions: [
    { key: 'grades:view', label: '查看' },
    { key: 'grades:create', label: '新增' },
    { key: 'grades:update', label: '编辑' },
    { key: 'grades:delete', label: '删除' },
  ]},
  { module: 'classes', label: '班级管理', actions: [
    { key: 'classes:view', label: '查看' },
    { key: 'classes:create', label: '新增' },
    { key: 'classes:update', label: '编辑' },
    { key: 'classes:delete', label: '删除' },
  ]},
  { module: 'enrollments', label: '报名管理', actions: [
    { key: 'enrollments:view', label: '查看' },
    { key: 'enrollments:create', label: '新增' },
    { key: 'enrollments:update', label: '编辑' },
    { key: 'enrollments:delete', label: '删除' },
  ]},
  { module: 'transfers', label: '结转退课', actions: [
    { key: 'transfers:view', label: '查看' },
    { key: 'transfers:create', label: '新增' },
  ]},
  { module: 'accounts', label: '账户管理', actions: [
    { key: 'accounts:view', label: '查看' },
  ]},
  { module: 'schedules', label: '排课管理', actions: [
    { key: 'schedules:view', label: '查看' },
    { key: 'schedules:create', label: '新增' },
    { key: 'schedules:update', label: '编辑' },
    { key: 'schedules:delete', label: '删除' },
    { key: 'schedules:reschedule', label: '调课/补课' },
  ]},
  { module: 'attendance', label: '点名管理', actions: [
    { key: 'attendance:view', label: '查看' },
    { key: 'attendance:update', label: '编辑' },
  ]},
  { module: 'teachers', label: '教师管理', actions: [
    { key: 'teachers:view', label: '查看' },
  ]},
  { module: 'feedback', label: '课后反馈', actions: [
    { key: 'feedback:view', label: '查看' },
    { key: 'feedback:create', label: '新增' },
    { key: 'feedback:update', label: '编辑' },
    { key: 'feedback:delete', label: '删除' },
  ]},
  { module: 'announcement', label: '公告管理', actions: [
    { key: 'announcement:view', label: '查看' },
    { key: 'announcement:update', label: '编辑' },
  ]},
  { module: 'reports', label: '报表中心', actions: [
    { key: 'reports:view', label: '查看' },
  ]},
  { module: 'settings', label: '系统设置', actions: [
    { key: 'settings:manage', label: '管理' },
  ]},
  { module: 'admins', label: '管理员账号', actions: [
    { key: 'admins:view', label: '查看' },
    { key: 'admins:create', label: '新增' },
    { key: 'admins:update', label: '编辑' },
    { key: 'admins:delete', label: '删除' },
  ]},
  { module: 'audit', label: '审计日志', actions: [
    { key: 'audit:view', label: '查看' },
  ]},
]

// 解析 admin 的有效权限集合
// - superadmin：通配（返回 null 表示全部拥有）
// - 其他角色：若 permissions 字段非空，则用自定义权限覆盖角色默认；否则用角色默认
function resolvePermissions(admin) {
  if (!admin) return []
  if (admin.role === 'superadmin') return null // 通配
  const custom = (admin.permissions || '').trim()
  if (custom) {
    return custom.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return ROLE_PERMISSIONS[admin.role] || []
}

// 判断 admin 是否拥有指定权限
// admin 为 { role, permissions } 或纯 role 字符串（兼容旧调用）
export function hasPermission(admin, permission) {
  // 兼容：旧调用方式 hasPermission(role, permission)
  if (typeof admin === 'string') {
    const role = admin
    const perms = ROLE_PERMISSIONS[role]
    if (!perms) return false
    if (perms === '*') return true
    return perms.includes(permission)
  }
  const perms = resolvePermissions(admin)
  if (perms === null) return true // superadmin 通配
  return perms.includes(permission)
}

// ========== 工具函数 ==========
function bufToHex(buf) {
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function bufToB64Url(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlToStr(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function hmacSign(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return bufToHex(sig)
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  const maxLen = Math.max(aBytes.length, bBytes.length)
  let diff = 0
  for (let i = 0; i < maxLen; i++) {
    const av = i < aBytes.length ? aBytes[i] : 0
    const bv = i < bBytes.length ? bBytes[i] : 0
    diff |= av ^ bv
  }
  diff |= aBytes.length ^ bBytes.length
  return diff === 0
}

// ========== 密码哈希（PBKDF2-HMAC-SHA256） ==========
// OWASP 2023 推荐 PBKDF2-HMAC-SHA256 最小 600000 次迭代
const PBKDF2_ITERATIONS = 600000

// 密码策略校验：至少 8 位，且包含字母和数字
// 返回 null 表示通过，否则返回错误信息
export function validatePasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return '密码至少 8 位'
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return '密码需同时包含字母和数字'
  }
  return null
}

export async function hashPassword(password) {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  const saltHex = bufToHex(salt)
  const hashHex = bufToHex(bits)
  return `${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`
}

export async function verifyPasswordHash(password, stored) {
  if (typeof stored !== 'string') return false
  const parts = stored.split(':')
  if (parts.length !== 3) return false
  const iterations = Number(parts[0])
  const salt = hexToBytes(parts[1])
  const expected = parts[2]
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return constantTimeEqual(bufToHex(bits), expected)
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// ========== Token 签发与校验 ==========
export function getTokenSecret() {
  return getTokenSecretFromConfig()
}

// 签发 token：携带主体 payload（uid/username/role/realName + 时间戳）
export async function signToken(secret, payload = {}) {
  const fullPayload = {
    uid: payload.uid || '',
    username: payload.username || '',
    role: payload.role || '',
    realName: payload.realName || '',
    ts: Date.now(),
  }
  const payloadStr = JSON.stringify(fullPayload)
  const enc = new TextEncoder()
  const payloadB64 = bufToB64Url(enc.encode(payloadStr))
  const sig = await hmacSign(secret, payloadB64)
  return `${payloadB64}.${sig}`
}

// 验证 token：返回 payload 对象（合法）或 null（非法/过期）
export async function verifyToken(token, secret, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!token || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = await hmacSign(secret, payloadB64)
  if (!constantTimeEqual(sig, expected)) return null
  let payload
  try {
    payload = JSON.parse(b64UrlToStr(payloadB64))
  } catch {
    return null
  }
  if (!payload || typeof payload.ts !== 'number') return null
  if (Date.now() - payload.ts > maxAgeMs) return null
  if (payload.ts > Date.now() + 60_000) return null
  return payload
}

export function extractToken(request) {
  const auth = request.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

// 判断是否处于"引导创建超管"阶段（admins 表为空）
export async function isBootstrapMode() {
  return (await countAdmins()) === 0
}

// 登录校验：username + password
// 返回 { ok, message?, bootstrap?, admin? }
export async function authenticate(username, inputPassword) {
  const adminCount = await countAdmins()
  if (adminCount === 0) {
    return { ok: false, message: '系统尚未初始化，请先完成超管账号创建引导', bootstrap: true }
  }
  if (!username) {
    return { ok: false, message: '请输入用户名' }
  }
  const admin = await getAdminByUsername(username)
  if (!admin) {
    return { ok: false, message: '用户名或密码错误' }
  }
  if (admin.status === 'disabled') {
    return { ok: false, message: '该账号已被禁用，请联系管理员' }
  }
  if (await verifyPasswordHash(inputPassword, admin.password_hash)) {
    return { ok: true, admin }
  }
  return { ok: false, message: '用户名或密码错误' }
}

// 鉴权中间件：校验通过注入 context.admin，失败返回 401 Response
// context.admin = { id, username, role, realName, payload }
export async function requireAuth(context) {
  try {
    const secret = getTokenSecret()
    const token = extractToken(context.request)
    const payload = await verifyToken(token, secret)
    if (!payload) {
      return new Response(
        JSON.stringify({ code: 401, message: '未登录或登录已过期，请重新登录', data: null }),
        { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      )
    }
    // 注入操作者信息（payload 已含主体，无需每次查库）
    context.admin = {
      id: payload.uid,
      username: payload.username,
      role: payload.role,
      realName: payload.realName,
      payload,
    }
    return null
  } catch (e) {
    console.error('[requireAuth] 鉴权异常:', e?.message || String(e))
    return new Response(
      JSON.stringify({ code: 1, message: '鉴权服务暂不可用，请稍后重试', data: null }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }
}

// 权限校验中间件：requireAuth 通过后再校验权限，失败返回 403
// 用法：const fail = await requirePermission(context, 'admins:create')
// 权限判定：查库取最新 permissions，支持自定义权限覆盖角色默认
// 同时校验账号是否被禁用（disabled 账号即使 token 未过期也拒绝操作）
export async function requirePermission(context, permission) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const admin = context.admin
  if (!admin) {
    return new Response(
      JSON.stringify({ code: 403, message: '权限不足，无法执行此操作', data: null }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }
  // 查库取最新状态与 permissions（superadmin 也需查库，防止被禁用后仍可操作）
  const latest = await getAdminById(admin.id)
  // 账号已被禁用：即使 token 未过期也拒绝
  if (latest && latest.status === 'disabled') {
    return new Response(
      JSON.stringify({ code: 403, message: '账号已被禁用，无法执行此操作', data: null }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }
  // superadmin 放行权限校验（但上面的 status 校验仍生效）
  if (admin.role === 'superadmin') return null
  const adminForCheck = latest || { role: admin.role, permissions: '' }
  if (!hasPermission(adminForCheck, permission)) {
    return new Response(
      JSON.stringify({ code: 403, message: '权限不足，无法执行此操作', data: null }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }
  // 注入最新 permissions 供后续审计使用
  if (latest) context.admin.permissions = latest.permissions
  return null
}

// 从请求中提取客户端 IP（审计用）
export function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || ''
}
