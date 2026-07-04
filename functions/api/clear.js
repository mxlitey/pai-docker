// 清空所有数据 API
// POST /api/clear -> 清空 Blob 存储中的全部学员与排课数据
import { clearAllData, json } from '../_lib/store.js'

export async function onRequestPost() {
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

// GET 方式便于调试（生产环境建议移除或加鉴权）
export async function onRequestGet() {
  return onRequestPost()
}
