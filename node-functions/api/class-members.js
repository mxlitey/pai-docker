// 班级成员管理 API
// GET    /api/class-members?classId=         查询班级成员名单
// POST   /api/class-members  { classId, studentIds: [] }   批量加成员（忽略已存在）
// DELETE /api/class-members  { classId, studentIds: [] }   批量移除成员
import { getClassMembers, addClassMembers, removeClassMembers, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'classes:view')
  if (authFail) return authFail
  const { request } = context
  const url = new URL(request.url)
  const classId = url.searchParams.get('classId') || ''
  if (!classId) {
    return json({ code: 1, message: '缺少 classId', data: null }, 400)
  }
  try {
    const members = await getClassMembers(classId)
    return json({ code: 0, message: 'ok', data: { members } })
  } catch (e) {
    console.error('[class-members] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}

export async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'classes:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { classId, studentIds } = body
  if (!classId) return json({ code: 1, message: '缺少 classId', data: null }, 400)
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return json({ code: 1, message: '请至少选择一名学员', data: null }, 400)
  }
  if (studentIds.length > 500) {
    return json({ code: 1, message: 'studentIds 数量不能超过 500 条', data: null }, 400)
  }
  try {
    const result = await addClassMembers(classId, studentIds)
    if (result.notFound) {
      return json({ code: 1, message: '班级不存在', data: null }, 404)
    }
    await writeAudit(context, {
      action: 'update',
      module: 'classes',
      targetType: 'class',
      targetId: classId,
      targetName: '',
      summary: `班级加成员 ${result.added} 名（共提交 ${studentIds.length} 名）`,
      after: { classId, added: result.added, studentIds },
    })
    return json({ code: 0, message: `已添加 ${result.added} 名成员`, data: result })
  } catch (e) {
    console.error('[class-members] 添加异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '添加失败，请稍后重试', data: null }, 500)
  }
}

export async function onRequestDelete(context) {
  const authFail = await requirePermission(context, 'classes:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { classId, studentIds } = body
  if (!classId) return json({ code: 1, message: '缺少 classId', data: null }, 400)
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return json({ code: 1, message: '请至少选择一名学员', data: null }, 400)
  }
  if (studentIds.length > 500) {
    return json({ code: 1, message: 'studentIds 数量不能超过 500 条', data: null }, 400)
  }
  try {
    const result = await removeClassMembers(classId, studentIds)
    await writeAudit(context, {
      action: 'update',
      module: 'classes',
      targetType: 'class',
      targetId: classId,
      targetName: '',
      summary: `班级移除成员 ${result.removed} 名`,
      before: { classId, removed: result.removed, studentIds },
    })
    return json({ code: 0, message: `已移除 ${result.removed} 名成员`, data: result })
  } catch (e) {
    console.error('[class-members] 移除异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '移除失败，请稍后重试', data: null }, 500)
  }
}
