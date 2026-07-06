// 鉴权工具 —— 基于 HMAC-SHA256 的 token 签发与验证
// 密码通过环境变量 ADMIN_PASSWORD_HASH（推荐，PBKDF2 加盐慢哈希）或 ADMIN_PASSWORD（明文，兼容旧部署）注入
// token 签名密钥使用 ADMIN_TOKEN_SECRET（与登录密码解耦，防止密码泄露后可离线伪造 token）
// token 格式: hex(HMAC-SHA256(secret, timestamp)) + "." + timestamp

// ArrayBuffer 转十六进制字符串（不依赖 btoa/atob，兼容 Edge Runtime）
function bufToHex(buf) {
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

// 十六进制字符串转 Uint8Array
function hexToBytes(hex) {
  const len = hex.length / 2
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

// PBKDF2-SHA256 派生密钥（用于密码哈希校验，防离线爆破）
async function pbkdf2Derive(password, salt, iterations) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
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
  // 长度不同也走完整比较，避免按长度早退
  const maxLen = Math.max(aBytes.length, bBytes.length)
  let diff = 0
  for (let i = 0; i < maxLen; i++) {
    const av = i < aBytes.length ? aBytes[i] : 0
    const bv = i < bBytes.length ? bBytes[i] : 0
    diff |= av ^ bv
  }
  // 长度差异也纳入 diff
  diff |= aBytes.length ^ bBytes.length
  return diff === 0
}

// 获取 token 签名密钥：优先使用 ADMIN_TOKEN_SECRET（推荐，与密码解耦）
// 若未配置则回退到 ADMIN_PASSWORD（明文，兼容旧部署，不推荐）
export function getTokenSecret(env) {
  return env?.ADMIN_TOKEN_SECRET || env?.ADMIN_PASSWORD || ''
}

// 校验密码：
//   - 若配置了 ADMIN_PASSWORD_HASH（格式: pbkdf2$<iterations>$<saltHex>$<hashHex>），
//     用 PBKDF2 重新派生并恒定时间比较（加盐慢哈希，防离线爆破）
//   - 否则回退到 ADMIN_PASSWORD 明文恒定时间比较（兼容旧部署）
export async function verifyPassword(input, env) {
  if (!input) return false
  const hashStr = env?.ADMIN_PASSWORD_HASH
  if (hashStr && typeof hashStr === 'string') {
    const parts = hashStr.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
    const iterations = Number(parts[1])
    const saltHex = parts[2]
    const expected = parts[3]
    if (!iterations || iterations < 1000 || !saltHex || !expected) return false
    try {
      const salt = hexToBytes(saltHex)
      const derived = await pbkdf2Derive(input, salt, iterations)
      return constantTimeEqual(bufToHex(derived), expected)
    } catch {
      return false
    }
  }
  // 明文回退（兼容旧部署）
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
// token 有效期默认 24 小时
export async function verifyToken(token, secret, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!token || !secret) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [sig, ts] = parts
  const tsNum = Number(ts)
  if (!tsNum) return false
  // 校验时效
  if (Date.now() - tsNum > maxAgeMs) return false
  // 防御未来时间戳（允许 60 秒时钟偏差），防止用未来时间签发超长有效期 token
  if (tsNum > Date.now() + 60_000) return false
  // 重新签名比对（恒定时间）
  const expected = await hmacSign(secret, ts)
  return constantTimeEqual(sig, expected)
}

// 从请求头提取 token
export function extractToken(request) {
  const auth = request.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

// 鉴权中间件：校验通过返回 null，失败返回 401 Response
export async function requireAuth(context) {
  try {
    const env = context.env || {}
    const secret = getTokenSecret(env)
    const hasPassword = env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD
    if (!hasPassword || !secret) {
      return new Response(
        JSON.stringify({ code: 1, message: '服务端未配置管理密码', data: null }),
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
    // 仅记录到日志，不向客户端回显内部异常详情，避免泄露实现细节
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
