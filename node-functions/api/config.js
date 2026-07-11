// 系统配置 API
// GET  /api/config   公开接口，返回前端首屏需要的配置（appName），无需鉴权
// PUT  /api/config    需鉴权，修改 appName 等配置（后台系统设置页调用）
import { getAllConfig, getAppName, setAppName, setRenewalThreshold, setBackupKeepDays, setBackupCron, setBackupMaxCount } from '../_lib/config-file.js'
import { requirePermission } from '../_lib/auth.js'
import { json } from '../_lib/store.js'

// 公开读取配置：仅返回前端首屏必需字段，不暴露备份策略等运维信息
function handleGet() {
  const cfg = getAllConfig()
  return json({
    code: 0,
    message: 'ok',
    data: {
      appName: cfg.appName,
      renewalThreshold: cfg.renewalThreshold,
      moduleEnabled: cfg.moduleEnabled,
    },
  })
}

// 完整配置（需 settings:manage 权限）：含备份策略等运维字段，供系统设置页加载
async function handleGetFull(context) {
  const authFail = await requirePermission(context, 'settings:manage')
  if (authFail) return authFail
  const cfg = getAllConfig()
  return json({ code: 0, message: 'ok', data: cfg })
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
    const { appName, renewalThreshold, backupKeepDays, backupCron, backupMaxCount } = body

    if (appName === undefined && renewalThreshold === undefined && backupKeepDays === undefined
        && backupCron === undefined && backupMaxCount === undefined) {
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
    if (backupCron !== undefined) {
      try {
        updated.backupCron = setBackupCron(backupCron)
      } catch (e) {
        return json({ code: 1, message: 'cron 表达式格式错误：' + (e?.message || String(e)), data: null }, 400)
      }
    }
    if (backupMaxCount !== undefined) {
      updated.backupMaxCount = setBackupMaxCount(backupMaxCount)
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
    const url = new URL(request.url)
    // 管理员完整配置：?full=1 需 settings:manage 权限
    if (url.searchParams.get('full') === '1') {
      return handleGetFull(context)
    }
    return handleGet()
  }
  if (request.method === 'PUT') {
    return handlePut(context)
  }
  return json({ code: 1, message: '不支持的请求方法', data: null }, 405)
}
