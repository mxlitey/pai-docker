// 认证 API
// POST /api/auth  body: { password: string } -> 登录验证，返回 token
// GET  /api/auth  (Authorization: Bearer <token>) -> 校验 token 有效性
import {
  signToken,
  verifyToken,
  verifyPassword,
  getTokenSecret,
  extractToken,
} from '../_lib/auth.js'
import { json } from '../_lib/store.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 登录：校验密码并签发 token
async function handleLogin(context) {
  try {
    const { request, env } = context
    const hasPassword = env?.ADMIN_PASSWORD_HASH || env?.ADMIN_PASSWORD
    if (!hasPassword) {
      return json(
        { code: 1, message: '服务端未配置管理密码', data: null },
        500,
      )
    }

    const body = await readBody(request)
    const { password: input } = body

    if (!input) {
      return json({ code: 1, message: '请输入密码', data: null }, 400)
    }

    // PBKDF2 加盐慢哈希校验（推荐）或明文恒定时间比较（兼容），防时序侧信道
    if (!(await verifyPassword(input, env))) {
      return json({ code: 1, message: '密码错误', data: null }, 401)
    }

    // token 使用独立的 ADMIN_TOKEN_SECRET 签名（与登录密码解耦）
    const secret = getTokenSecret(env)
    if (!secret) {
      return json(
        { code: 1, message: '服务暂不可用，请稍后重试', data: null },
        500,
      )
    }
    const token = await signToken(secret)
    return json({
      code: 0,
      message: '登录成功',
      data: { token },
    })
  } catch (e) {
    // 仅记录到日志，不向客户端回显内部异常详情，避免泄露实现细节
    console.error('[auth] 登录异常:', e?.message || String(e))
    return json(
      { code: 1, message: '服务暂不可用，请稍后重试', data: null },
      500,
    )
  }
}

// 校验 token 有效性（前端进入管理页时调用，防止本地伪造 token 绕过登录页）
async function handleVerify(context) {
  try {
    const { request, env } = context
    const secret = getTokenSecret(env)
    const hasPassword = env?.ADMIN_PASSWORD_HASH || env?.ADMIN_PASSWORD
    if (!hasPassword || !secret) {
      return json(
        { code: 1, message: '服务端未配置管理密码', data: null },
        500,
      )
    }
    const token = extractToken(request)
    const ok = await verifyToken(token, secret)
    if (!ok) {
      return json(
        { code: 401, message: '未登录或登录已过期，请重新登录', data: null },
        401,
      )
    }
    return json({ code: 0, message: 'ok', data: { valid: true } })
  } catch (e) {
    console.error('[auth] 校验异常:', e?.message || String(e))
    return json(
      { code: 1, message: '服务暂不可用，请稍后重试', data: null },
      500,
    )
  }
}

export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'POST') return handleLogin(context)
  if (request.method === 'GET') return handleVerify(context)
  return json({ code: 1, message: '不支持的请求方法', data: null }, 405)
}
