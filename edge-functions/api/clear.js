// 清空所有数据 API
// POST /api/clear 或 GET /api/clear -> 清空 Blob 存储中的全部学员与排课数据
import { clearAllData, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

async function handleClear() {
  const result = await clearAllData()
  return json({
    code: 0,
    message: '所有数据已清空',
    data: {
      deletedCount: result.deletedCount,
      keys: result.keys,
    },
  })
}

// 支持 POST 和 GET 两种方式触发（需鉴权）
export default async function onRequest(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  if (request.method === 'POST' || request.method === 'GET') {
    return handleClear()
  }
  return json({ code: 1, message: '不支持的请求方法', data: null }, 405)
}
