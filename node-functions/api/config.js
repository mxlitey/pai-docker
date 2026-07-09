// 系统配置 API
// GET  /api/config   公开接口，返回 appName 等前端需要的配置（首屏加载用）
// PUT  /api/config    需鉴权，修改 appName 等配置（后台系统设置页调用）
import { getAllConfig, getAppName, setAppName, setRenewalThreshold, setBackupKeepDays } from '../_lib/config-file.js'
import { requirePermission } from '../_lib/auth.js'
import { json } from '../_lib/store.js'

// 公开读取配置：前端首屏加载时调用，无需鉴权
function handleGet() {
  // appName 为高频首屏字段，其余配置项一并返回供后台使用
  const cfg = getAllConfig()
  return json({
    code: 0,
    message: 'ok',
    data: cfg,
  })
}

// 修改配置：需鉴权
// body: { appName?: string }
async function handlePut(context) {
  const authFail = await requirePermission(context, 'settings:manage')
  if (authFail) return authFail

  try {
    const { request } = context
    let body = {}
    try {
      body = await request.json()
    } catch {
      // 忽略解析失败
    }
    const { appName, renewalThreshold, backupKeepDays } = body

    if (appName === undefined && renewalThreshold === undefined && backupKeepDays === undefined) {
      return json({ code: 1, message: '未提供需要更新的配置项', data: null }, 400)
    }

    const updated = {}
    if (typeof appName === 'string') {
      updated.appName = setAppName(appName)
    }
    if (renewalThreshold !== undefined) {
      updated.renewalThreshold = setRenewalThreshold(renewalThreshold)
    }
    if (backupKeepDays !== undefined) {
      updated.backupKeepDays = setBackupKeepDays(backupKeepDays)
    }

    return json({
      code: 0,
      message: '配置已保存',
      data: updated,
    })
  } catch (e) {
    console.error('[config] 保存异常:', e?.message || String(e))
    return json(
      { code: 1, message: '保存失败，请稍后重试', data: null },
      500,
    )
  }
}

export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (request.method === 'GET') {
    return handleGet()
  }
  if (request.method === 'PUT') {
    return handlePut(context)
  }
  return json({ code: 1, message: '不支持的请求方法', data: null }, 405)
}
