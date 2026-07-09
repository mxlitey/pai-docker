// 认证 API（Docker 版）
// POST /api/auth          登录验证，返回 token
// GET  /api/auth          校验 token 有效性
// POST /api/auth/bootstrap 引导创建超管账号（仅在系统未初始化时可用）
import {
  signToken,
  verifyToken,
  authenticate,
  getTokenSecret,
  extractToken,
  isBootstrapMode,
  hashPassword,
  createSuperAdmin,
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
    const body = await readBody(request)
    const { password: input } = body

    if (!input) {
      return json({ code: 1, message: '请输入密码', data: null }, 400)
    }

    // 引导阶段：拒绝登录，前端应跳转到引导页
    if (await isBootstrapMode()) {
      return json(
        { code: 1, message: '系统尚未初始化，请先完成超管账号创建引导', data: null, bootstrap: true },
        412,
      )
    }

    const result = await authenticate(input, env)
    if (!result.ok) {
      return json({ code: 1, message: result.message || '密码错误', data: null }, 401)
    }

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
    console.error('[auth] 登录异常:', e?.message || String(e))
    return json(
      { code: 1, message: '服务暂不可用，请稍后重试', data: null },
      500,
    )
  }
}

// 校验 token 有效性
async function handleVerify(context) {
  try {
    const { request, env } = context
    const secret = getTokenSecret(env)
    if (!secret) {
      return json(
        { code: 1, message: '服务端未配置 token 密钥', data: null },
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
    return json({
      code: 0,
      message: 'ok',
      data: {
        valid: true,
        // 附加引导状态，供前端决定是否跳转引导页
        bootstrap: await isBootstrapMode(),
      },
    })
  } catch (e) {
    console.error('[auth] 校验异常:', e?.message || String(e))
    return json(
      { code: 1, message: '服务暂不可用，请稍后重试', data: null },
      500,
    )
  }
}

// 引导创建超管账号
// body: { password: string, confirmPassword?: string }
// 仅在 admin 表为空时可用；创建后即退出引导模式
async function handleBootstrap(context) {
  try {
    const { request } = context
    if (!(await isBootstrapMode())) {
      return json(
        { code: 1, message: '系统已初始化，引导接口已关闭', data: null },
        409,
      )
    }
    const body = await readBody(request)
    const { password, confirmPassword } = body
    if (!password || typeof password !== 'string') {
      return json({ code: 1, message: '请输入密码', data: null }, 400)
    }
    if (password.length < 6) {
      return json({ code: 1, message: '密码至少 6 位', data: null }, 400)
    }
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return json({ code: 1, message: '两次输入的密码不一致', data: null }, 400)
    }
    const hash = await hashPassword(password)
    await createSuperAdmin('admin', hash)
    return json({
      code: 0,
      message: '超管账号创建成功，请使用该密码登录',
      data: { username: 'admin' },
    })
  } catch (e) {
    console.error('[auth] 引导创建异常:', e?.message || String(e))
    return json(
      { code: 1, message: '创建失败，请稍后重试', data: null },
      500,
    )
  }
}

// 查询当前是否处于引导模式（前端用于决定是否展示引导页）
async function handleBootstrapStatus() {
  return json({
    code: 0,
    message: 'ok',
    data: { bootstrap: await isBootstrapMode() },
  })
}

export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  if (request.method === 'POST') {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/bootstrap')) {
      return handleBootstrap(context)
    }
    return handleLogin(context)
  }
  if (request.method === 'GET') {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/bootstrap')) {
      return handleBootstrapStatus()
    }
    return handleVerify(context)
  }
  return json({ code: 1, message: '不支持的请求方法', data: null }, 405)
}
