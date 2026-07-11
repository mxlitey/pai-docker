// 审计日志归档 API
// GET    /api/audit-archives            列出所有归档（需 audit:view 权限）
// GET    /api/audit-archives?month=YYYY-MM 查看指定月份归档内容（需 audit:view 权限）
// POST   /api/audit-archives            手动触发归档（body: { month }）（需 audit:view 或 settings:manage）
// DELETE /api/audit-archives?month=YYYY-MM 删除指定月份归档（需 settings:manage 权限）
import {
  archiveAuditLogs, listAuditArchives, readAuditArchive, deleteAuditArchive,
  json,
} from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

// 月份参数校验（与 core.js validateMonth 一致，便于提前拦截并返回 400）
function isValidMonth(m) {
  return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)
}

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验「满足任一权限」：先查主权限，失败再查备选权限；都失败返回首个失败响应
async function requireAnyPermission(context, primary, fallback) {
  const fail1 = await requirePermission(context, primary)
  if (!fail1) return null
  const fail2 = await requirePermission(context, fallback)
  if (!fail2) return null
  return fail1
}

// GET：列出归档 / 查看指定月份归档内容
export async function onRequestGet(context) {
  const fail = await requirePermission(context, 'audit:view')
  if (fail) return fail
  const url = new URL(context.request.url)
  const month = url.searchParams.get('month') || ''

  // 查看指定月份归档内容
  if (month) {
    if (!isValidMonth(month)) {
      return json({ code: 1, message: 'month 格式应为 yyyy-MM', data: null }, 400)
    }
    try {
      const result = readAuditArchive(month)
      return json({ code: 0, message: 'ok', data: result })
    } catch (e) {
      return json({ code: 1, message: e.message || '读取归档失败', data: null }, 404)
    }
  }

  // 列出所有归档
  try {
    const archives = listAuditArchives()
    return json({ code: 0, message: 'ok', data: { archives } })
  } catch (e) {
    return json({ code: 1, message: e.message || '查询失败', data: null }, 500)
  }
}

// POST：手动触发归档
export async function onRequestPost(context) {
  // 需 audit:view 权限，或 settings:manage 权限
  const fail = await requireAnyPermission(context, 'audit:view', 'settings:manage')
  if (fail) return fail
  try {
    const body = await readBody(context.request)
    const month = body.month
    if (!isValidMonth(month)) {
      return json({ code: 1, message: 'month 格式应为 yyyy-MM', data: null }, 400)
    }
    const result = archiveAuditLogs(month)
    await writeAudit(context, {
      action: 'create',
      module: 'audit',
      targetType: 'audit_archive',
      targetId: month,
      targetName: month,
      summary: `归档 ${month} 审计日志 ${result.archived} 条`,
      after: { month, archived: result.archived, filename: result.filename, size: result.size },
    })
    return json({ code: 0, message: `已归档 ${result.archived} 条日志`, data: result })
  } catch (e) {
    return json({ code: 1, message: e.message || '归档失败', data: null }, 500)
  }
}

// DELETE：删除指定月份归档
export async function onRequestDelete(context) {
  const fail = await requirePermission(context, 'settings:manage')
  if (fail) return fail
  const url = new URL(context.request.url)
  const month = url.searchParams.get('month') || ''
  if (!isValidMonth(month)) {
    return json({ code: 1, message: 'month 格式应为 yyyy-MM', data: null }, 400)
  }
  try {
    deleteAuditArchive(month)
    await writeAudit(context, {
      action: 'delete',
      module: 'audit',
      targetType: 'audit_archive',
      targetId: month,
      targetName: month,
      summary: `删除 ${month} 审计日志归档`,
      after: { month },
    })
    return json({ code: 0, message: '已删除', data: { deleted: true } })
  } catch (e) {
    return json({ code: 1, message: e.message || '删除失败', data: null }, 404)
  }
}
