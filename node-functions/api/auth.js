// 认证 API
// POST /api/auth          登录验证（username + password），返回 token + 当前用户信息
// GET  /api/auth          校验 token 有效性 + 返回当前用户信息
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
  getClientIp,
  validatePasswordPolicy,
} from '../_lib/auth.js'
import { json, recordLogin, addAuditLog, getAdminById } from '../_lib/store.js'
import { checkLoginRateLimit } from '../_lib/rate-limit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 当前用户信息（供前端展示用户名/角色/权限）
// admin 为 rowToAdmin 结果（驼峰字段）
function publicAdminInfo(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    realName: admin.realName || admin.real_name || '',
    phone: admin.phone || '',
    status: admin.status,
    permissions: admin.permissions || '',
  }
}

// 登录：校验用户名+密码并签发带主体 token
async function handleLogin(context) {
  try {
    const { request } = context
    const ip = getClientIp(context)
    // 速率限制：防暴力破解（每 IP 每分钟 10 次）
    const rl = checkLoginRateLimit(ip)
    if (!rl.ok) {
      return json({ code: 1, message: `尝试过于频繁，请 ${Math.ceil(rl.retryAfterMs / 1000)} 秒后再试`, data: null }, 429)
    }
    const body = await readBody(request)
    const { username, password } = body

    if (!username) {
      return json({ code: 1, message: '请输入用户名', data: null }, 400)
    }
    if (!password) {
      return json({ code: 1, message: '请输入密码', data: null }, 400)
    }

    if (await isBootstrapMode()) {
      return json(
        { code: 1, message: '系统尚未初始化，请先完成超管账号创建引导', data: null, bootstrap: true },
        412,
      )
    }

    const result = await authenticate(username, password)
    if (!result.ok) {
      // 登录失败也记审计（账号不存在/密码错误）
      try {
        await addAuditLog({
          actorId: '', actorName: username, actorRole: '',
          action: 'login', module: 'auth',
          targetType: 'admin', targetId: '', targetName: username,
          summary: `登录失败：${result.message}`, ip: getClientIp(context),
        })
      } catch { /* 审计失败不影响登录流程 */ }
      return json({ code: 1, message: result.message || '用户名或密码错误', data: null }, 401)
    }

    const admin = result.admin
    const secret = getTokenSecret()
    const token = await signToken(secret, {
      uid: admin.id,
      username: admin.username,
      role: admin.role,
      realName: admin.real_name || '',
    })
    // 记录登录时间/IP
    await recordLogin(admin.id, getClientIp(context))
    // 审计：登录成功
    try {
      await addAuditLog({
        actorId: admin.id, actorName: admin.username, actorRole: admin.role,
        action: 'login', module: 'auth',
        targetType: 'admin', targetId: admin.id, targetName: admin.username,
        summary: `${admin.username} 登录成功`, ip: getClientIp(context),
      })
    } catch { /* ignore */ }

    return json({
      code: 0,
      message: '登录成功',
      data: { token, admin: publicAdminInfo(admin) },
    })
  } catch (e) {
    console.error('[auth] 登录异常:', e?.message || String(e))
    return json({ code: 1, message: '服务暂不可用，请稍后重试', data: null }, 500)
  }
}

// 校验 token 有效性，返回当前用户信息
async function handleVerify(context) {
  try {
    const { request } = context
    const secret = getTokenSecret()
    const token = extractToken(request)
    const payload = await verifyToken(token, secret)
    if (!payload) {
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
        bootstrap: await isBootstrapMode(),
        admin: {
          id: payload.uid,
          username: payload.username,
          role: payload.role,
          realName: payload.realName || '',
          // 查库返回最新 permissions，确保权限变更后立即生效
          permissions: (await getAdminById(payload.uid))?.permissions || '',
        },
      },
    })
  } catch (e) {
    console.error('[auth] 校验异常:', e?.message || String(e))
    return json({ code: 1, message: '服务暂不可用，请稍后重试', data: null }, 500)
  }
}

// 引导创建超管账号
// body: { username, password, confirmPassword? }
async function handleBootstrap(context) {
  try {
    const { request } = context
    if (!(await isBootstrapMode())) {
      return json({ code: 1, message: '系统已初始化，引导接口已关闭', data: null }, 409)
    }
    const body = await readBody(request)
    const { username, password, confirmPassword } = body
    if (!username || typeof username !== 'string' || !/^[A-Za-z0-9_]{3,32}$/.test(username)) {
      return json({ code: 1, message: '用户名需为 3-32 位字母/数字/下划线', data: null }, 400)
    }
    if (!password || typeof password !== 'string') {
      return json({ code: 1, message: '请输入密码', data: null }, 400)
    }
    const pwdErr = validatePasswordPolicy(password)
    if (pwdErr) {
      return json({ code: 1, message: pwdErr, data: null }, 400)
    }
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return json({ code: 1, message: '两次输入的密码不一致', data: null }, 400)
    }
    const hash = await hashPassword(password)
    const created = await createSuperAdmin(username, hash)
    try {
      await addAuditLog({
        actorId: created.id, actorName: username, actorRole: 'superadmin',
        action: 'bootstrap', module: 'auth',
        targetType: 'admin', targetId: created.id, targetName: username,
        summary: `引导创建超管账号 ${username}`, ip: getClientIp(context),
      })
    } catch { /* ignore */ }
    return json({
      code: 0,
      message: '超管账号创建成功，请使用该账号登录',
      data: { username },
    })
  } catch (e) {
    console.error('[auth] 引导创建异常:', e?.message || String(e))
    return json({ code: 1, message: '创建失败，请稍后重试', data: null }, 500)
  }
}

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
    return new Response(null, { status: 204 })
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
