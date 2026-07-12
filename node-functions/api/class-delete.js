// 删除班级 API
// DELETE /api/class-delete  body: { id }
// 仍有排课引用该班级时拒绝删除，返回 inUse + 排课数；否则级联删除班级成员
import { deleteClass, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestDelete(context) {
  const authFail = await requirePermission(context, 'classes:delete')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { id } = body

  if (!id) {
    return json({ code: 1, message: '缺少 id', data: null }, 400)
  }

  try {
    const result = await deleteClass(id.trim())
    if (result.notFound) {
      return json({ code: 1, message: '班级不存在', data: null }, 404)
    }
    if (result.blocked) {
      return json({
        code: 1,
        message: result.message,
        data: result,
      }, 400)
    }
    if (result.inUse) {
      return json({
        code: 1,
        message: `该班级仍有 ${result.scheduleCount} 条排课引用，请先删除相关排课后再删除班级`,
        data: result,
      }, 409)
    }
    const before = result.before || null
    const className = before?.name || id.trim()
    await writeAudit(context, {
      action: 'delete',
      module: 'classes',
      targetType: 'class',
      targetId: id.trim(),
      targetName: className,
      summary: `删除班级「${className}」及其成员关联`,
      before,
    })
    return json({ code: 0, message: '班级已删除', data: result })
  } catch (e) {
    console.error('[class-delete] 删除异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '删除失败，请稍后重试', data: null }, 500)
  }
}
