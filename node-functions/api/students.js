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

  let students = await getStudents()

  if (q) {
    // 精确匹配优先（仅 name），模糊匹配其次
    const exact = students.filter((s) => s.name === q)
    const fuzzy = students.filter((s) => s.name !== q && s.name.includes(q))
    students = [...exact, ...fuzzy]
  }

  return json({ code: 0, message: 'ok', data: { students } })
}
