// 临时调试接口：返回所有请求头和 getClientIp 结果，用于排查 IP 提取问题
// 排查完可删除此文件
import { getClientIp } from '../_lib/auth.js'

export async function onRequestGet(context) {
  const { request } = context
  const headers = {}
  // 收集所有请求头
  for (const [k, v] of request.headers.entries()) {
    headers[k] = v
  }
  return new Response(JSON.stringify({
    clientIp: getClientIp(context),
    remoteAddress: context.remoteAddress || null,
    headers,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
