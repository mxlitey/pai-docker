// 公告 API
// GET  /api/announcement -> 公开读取公告内容（首页与日历页异步加载）
// POST /api/announcement -> 保存公告（需鉴权，管理员在后台编辑）
import { getAnnouncement, saveAnnouncement, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

// 公开读取：无鉴权，前端首屏异步调用
// 失败时返回空内容，前端按「无公告」处理，不阻塞主流程
async function handleGet() {
  try {
    const data = await getAnnouncement()
    return json({ code: 0, message: 'ok', data })
  } catch (e) {
    console.error('[announcement] 读取异常:', e?.message || String(e))
    return json({ code: 0, message: 'ok', data: { content: '', updatedAt: '' } })
  }
}

// 鉴权保存：管理员在后台编辑公告内容
async function handlePost(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ code: 1, message: '请求体格式错误，需为 JSON', data: null }, 400)
  }
  const content = typeof body?.content === 'string' ? body.content : ''
  // 限制单条公告最大长度，避免滥用
  const MAX_LEN = 5000
  if (content.length > MAX_LEN) {
    return json({ code: 1, message: `公告内容过长（最多 ${MAX_LEN} 字）`, data: null }, 400)
  }
  const data = await saveAnnouncement(content)
  return json({ code: 0, message: '公告已保存', data })
}

export default async function onRequest(context) {
  const { request } = context
  // 预检请求直接放行
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
  if (request.method === 'GET') {
    return handleGet()
  }
  if (request.method === 'POST') {
    const authFail = await requireAuth(context)
    if (authFail) return authFail
    return handlePost(request)
  }
  return json({ code: 1, message: '不支持的请求方法，请使用 GET 或 POST', data: null }, 405)
}
