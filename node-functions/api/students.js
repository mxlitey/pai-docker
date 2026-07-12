// 学员查询 API
// GET /api/students          -> 获取所有学员（需 students:view 权限）
// GET /api/students?q=张伟   -> 按姓名搜索（精确+模糊）
import { getStudents, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'students:view')
  if (authFail) return authFail

  const { request } = context
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()

  // 搜索条件直接下推到 SQL（利用 idx_students_name 索引），避免全量加载后 JS 遍历
  const students = await getStudents(q)

  return json({ code: 0, message: 'ok', data: { students } })
}
