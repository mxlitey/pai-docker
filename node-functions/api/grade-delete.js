// 删除年级 API
// DELETE /api/grade-delete  body: { id }
// 仍有学员/课程引用该年级名称时拒绝删除，返回 inUse + 引用计数
import { deleteGrade, json } from '../_lib/store.js'
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
  const authFail = await requirePermission(context, 'grades:delete')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { id } = body

  if (!id) {
    return json({ code: 1, message: '缺少 id', data: null }, 400)
  }

  try {
    const result = await deleteGrade(id.trim())
    if (result.notFound) {
      return json({ code: 1, message: '年级不存在', data: null }, 404)
    }
    if (result.inUse) {
      return json({
        code: 1,
        message: `该年级仍被 ${result.studentCount} 名学员、${result.courseCount} 门课程引用，请先迁移或清空后再删除`,
        data: result,
      }, 409)
    }
    await writeAudit(context, {
      action: 'delete',
      module: 'grades',
      targetType: 'grade',
      targetId: id.trim(),
      targetName: '',
      summary: '删除年级',
    })
    return json({ code: 0, message: '年级已删除', data: result })
  } catch (e) {
    console.error('[grade-delete] 删除异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '删除失败，请稍后重试', data: null }, 500)
  }
}
