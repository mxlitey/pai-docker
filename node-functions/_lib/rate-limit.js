// 速率限制：基于内存的滑动窗口计数器（按 key 维度）
// 用于防止暴力破解登录、家长端 H5 手机号后4位枚举等
// 进程内单机限流，适合单实例部署；多实例需改用共享存储

const buckets = new Map() // key -> { count, resetAt }

// 默认每分钟清理一次过期桶，避免内存无限增长
let lastSweep = Date.now()

/**
 * 检查是否超限
 * @param {string} key 限流维度（如 `login:${ip}` 或 `parent:${studentId}`）
 * @param {number} max  窗口内最大允许次数
 * @param {number} windowMs 窗口大小（毫秒）
 * @returns {{ ok: boolean, retryAfterMs: number, remaining: number }}
 */
export function rateLimitCheck(key, max, windowMs) {
  // 惰性清理过期桶
  const now = Date.now()
  if (now - lastSweep > 60_000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k)
    }
    lastSweep = now
  }

  const entry = buckets.get(key)
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterMs: 0, remaining: max - 1 }
  }
  entry.count += 1
  const ok = entry.count <= max
  return {
    ok,
    retryAfterMs: ok ? 0 : entry.resetAt - now,
    remaining: Math.max(0, max - entry.count),
  }
}

// 便捷封装：登录限流
// 纯 IP 维度，每 IP 每分钟 5 次
// 防暴力破解登录：限制单 IP 在窗口内的尝试次数
export function checkLoginRateLimit(ip) {
  return rateLimitCheck(`login:${ip || 'unknown'}`, 5, 60_000)
}

// 便捷封装：家长端 H5 校验限流
// 纯 IP 维度，每 IP 每分钟 5 次
// 防手机号后4位枚举撞库：限制单 IP 在窗口内的尝试次数
export function checkParentAccessRateLimit(ip) {
  return rateLimitCheck(`parent:${ip || 'unknown'}`, 5, 60_000)
}
