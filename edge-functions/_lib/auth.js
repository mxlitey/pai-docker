// 鉴权工具 —— 基于 HMAC-SHA256 的 token 签发与验证
// 密码通过环境变量 ADMIN_PASSWORD 注入，代码中不硬编码
// token 格式: hex(HMAC-SHA256(password, timestamp)) + "." + timestamp

// ArrayBuffer 转十六进制字符串（不依赖 btoa/atob，兼容 Edge Runtime）
function bufToHex(buf) {
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

// 用密码对消息做 HMAC-SHA256，返回十六进制签名
async function hmacSign(password, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return bufToHex(sig)
}

// 签发 token：用密码签名当前时间戳
export async function signToken(password) {
  const ts = String(Date.now())
  const sig = await hmacSign(password, ts)
  return `${sig}.${ts}`
}

// 验证 token：用环境变量中的密码重新计算签名并比对
// token 有效期默认 24 小时
export async function verifyToken(token, password, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!token || !password) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [sig, ts] = parts
  const tsNum = Number(ts)
  if (!tsNum) return false
  // 校验时效
  if (Date.now() - tsNum > maxAgeMs) return false
  // 重新签名比对
  const expected = await hmacSign(password, ts)
  // 常量时间比较防时序攻击
  if (sig.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

// 从请求头提取 token
export function extractToken(request) {
  const auth = request.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

// 鉴权中间件：校验通过返回 null，失败返回 401 Response
export async function requireAuth(context) {
  const password = context.env?.ADMIN_PASSWORD
  if (!password) {
    return new Response(
      JSON.stringify({ code: 1, message: '服务端未配置管理密码（ADMIN_PASSWORD 环境变量）', data: null }),
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
  const ok = await verifyToken(token, password)
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
}
