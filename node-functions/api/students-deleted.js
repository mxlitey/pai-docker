// 已删除学员查询 API（退费学员查询入口）
// GET /api/students-deleted          -> 获取所有已软删除学员（需 transfers:view 权限）
// GET /api/students-deleted?q=张伟   -> 按姓名搜索
// 用于结转退课-退费子页，展示被删除时仍有余额的学员（需退费）
import { getDeletedStudents, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'transfers:view')
  if (authFail) return authFail

  const { request } = context
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()

  try {
    const students = await getDeletedStudents(q)
    return json({ code: 0, message: 'ok', data: { students } })
  } catch (e) {
    console.error('[students-deleted] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}
