// 鉴权工具 —— 基于 HMAC-SHA256 的 token 签发与验证
// token 格式: hex(HMAC-SHA256(secret, timestamp)) + "." + timestamp
//
// 兼容两种模式：
// 1. 旧模式（环境变量）：ADMIN_PASSWORD + ADMIN_TOKEN_SECRET，保持与 EdgeOne 版一致
// 2. 新模式（admin 表）：超管账号密码存于 SQLite admin 表，为后期多账号体系预留
// 启动时优先检查 admin 表；admin 表为空时进入"引导创建超管"流程

import {
  countAdmins,
  getAdminByUsername,
  createSuperAdmin,
} from './store-sqlite.js'

// re-export，供 api 层直接从 auth.js 引入
export { createSuperAdmin }

// ArrayBuffer 转十六进制字符串（不依赖 btoa/atob，兼容 Edge Runtime）
function bufToHex(buf) {
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

// 用密钥对消息做 HMAC-SHA256，返回十六进制签名
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

// 恒定时间字符串比较，防止时序侧信道攻击
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

// PBKDF2-HMAC-SHA256 密码哈希（admin 表存储，防彩虹表）
// 返回 "iterations:salt:hash" 格式字符串
const PBKDF2_ITERATIONS = 100000
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

// 获取 token 签名密钥：
// - 优先使用 ADMIN_TOKEN_SECRET 环境变量（与登录密码解耦）
// - 回退到 ADMIN_PASSWORD（不推荐）
// - 都未配置时使用固定 fallback（仅用于引导阶段，正式部署应配置 SECRET）
export function getTokenSecret(env) {
  return env?.ADMIN_TOKEN_SECRET || env?.ADMIN_PASSWORD || 'pai-default-dev-secret-change-me'
}

// 旧模式：校验明文密码（环境变量 ADMIN_PASSWORD）
export function verifyPassword(input, env) {
  if (!input) return false
  const password = env?.ADMIN_PASSWORD
  if (!password) return false
  return constantTimeEqual(input, password)
}

// 签发 token：用 secret 签名当前时间戳
export async function signToken(secret) {
  const ts = String(Date.now())
  const sig = await hmacSign(secret, ts)
  return `${sig}.${ts}`
}

// 验证 token：用 secret 重新计算签名并比对
export async function verifyToken(token, secret, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!token || !secret) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [sig, ts] = parts
  const tsNum = Number(ts)
  if (!tsNum) return false
  if (Date.now() - tsNum > maxAgeMs) return false
  if (tsNum > Date.now() + 60_000) return false
  const expected = await hmacSign(secret, ts)
  return constantTimeEqual(sig, expected)
}

// 从请求头提取 token
export function extractToken(request) {
  const auth = request.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

// 判断是否处于"引导创建超管"阶段（admin 表为空）
export async function isBootstrapMode() {
  return (await countAdmins()) === 0
}

// 登录校验：优先走 admin 表，回退到环境变量模式
// 返回 { ok: boolean, message: string }
export async function authenticate(inputPassword, env) {
  const adminCount = await countAdmins()
  if (adminCount === 0) {
    // 引导阶段：不接受登录，必须先创建超管
    return { ok: false, message: '系统尚未初始化，请先完成超管账号创建引导', bootstrap: true }
  }
  // admin 表模式：尝试用默认用户名 admin 登录（当前阶段固定单超管）
  const admin = await getAdminByUsername('admin')
  if (admin && await verifyPasswordHash(inputPassword, admin.password_hash)) {
    return { ok: true, admin }
  }
  // 回退到环境变量模式（兼容旧版迁移用户）
  if (verifyPassword(inputPassword, env)) {
    return { ok: true, admin: null }
  }
  return { ok: false, message: '密码错误' }
}

// 鉴权中间件：校验通过返回 null，失败返回 401 Response
export async function requireAuth(context) {
  try {
    const env = context.env || {}
    const secret = getTokenSecret(env)
    if (!secret) {
      return new Response(
        JSON.stringify({ code: 1, message: '服务端未配置 token 密钥', data: null }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
    }
    const token = extractToken(context.request)
    const ok = await verifyToken(token, secret)
    if (!ok) {
      return new Response(
        JSON.stringify({ code: 401, message: '未登录或登录已过期，请重新登录', data: null }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
    }
    return null
  } catch (e) {
    console.error('[requireAuth] 鉴权异常:', e?.message || String(e))
    return new Response(
      JSON.stringify({ code: 1, message: '鉴权服务暂不可用，请稍后重试', data: null }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
}
