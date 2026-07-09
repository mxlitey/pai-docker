// 数据备份与恢复 API
// GET    /api/backups          列出所有备份（需 reports:view 或 settings 权限）
// POST   /api/backups          立即创建一份备份
// DELETE /api/backups?filename= 删除指定备份
// POST   /api/backups/restore   从指定备份恢复（恢复前自动快照）
import {
  createBackup, listBackups, deleteBackup, restoreBackup,
} from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'
import { getBackupKeepDays } from '../_lib/config-file.js'
import { json } from '../_lib/store.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  // 备份/恢复属高危操作，要求管理员权限
  const authFail = await requirePermission(context, 'settings:manage')
  if (authFail) return authFail

  const url = new URL(request.url)

  // POST /api/backups/restore —— 恢复
  if (url.pathname.endsWith('/restore') && request.method === 'POST') {
    try {
      const body = await readBody(request)
      const { filename } = body
      if (!filename) {
        return json({ code: 1, message: '缺少 filename', data: null }, 400)
      }
      const result = restoreBackup(filename)
      await writeAudit(context, {
        action: 'restore',
        module: 'backups',
        targetType: 'backup',
        targetId: filename,
        targetName: filename,
        summary: `从备份 ${filename} 恢复数据（恢复前快照：${result.preSnapshot}）`,
        after: { filename, preSnapshot: result.preSnapshot },
      })
      return json({ code: 0, message: `已从 ${filename} 恢复（恢复前快照：${result.preSnapshot}）`, data: result })
    } catch (e) {
      return json({ code: 1, message: e.message || '恢复失败', data: null }, 500)
    }
  }

  // POST /api/backups —— 创建备份
  if (request.method === 'POST') {
    try {
      const result = createBackup()
      await writeAudit(context, {
        action: 'backup',
        module: 'backups',
        targetType: 'backup',
        targetId: result.filename,
        targetName: result.filename,
        summary: `创建数据备份 ${result.filename}`,
        after: { filename: result.filename, size: result.size },
      })
      return json({ code: 0, message: '备份已创建', data: result })
    } catch (e) {
      return json({ code: 1, message: e.message || '备份失败', data: null }, 500)
    }
  }

  // DELETE /api/backups?filename= —— 删除备份
  if (request.method === 'DELETE') {
    try {
      const filename = url.searchParams.get('filename')
      if (!filename) {
        return json({ code: 1, message: '缺少 filename', data: null }, 400)
      }
      deleteBackup(filename)
      await writeAudit(context, {
        action: 'delete',
        module: 'backups',
        targetType: 'backup',
        targetId: filename,
        targetName: filename,
        summary: `删除备份 ${filename}`,
        after: { filename },
      })
      return json({ code: 0, message: '已删除', data: { ok: true } })
    } catch (e) {
      return json({ code: 1, message: e.message || '删除失败', data: null }, 500)
    }
  }

  // GET /api/backups —— 列出备份
  if (request.method === 'GET') {
    try {
      const backups = listBackups()
      const keepDays = getBackupKeepDays()
      return json({
        code: 0,
        message: 'ok',
        data: { backups, keepDays },
      })
    } catch (e) {
      return json({ code: 1, message: e.message || '查询失败', data: null }, 500)
    }
  }

  return json({ code: 1, message: '不支持的请求方法', data: null }, 405)
}
