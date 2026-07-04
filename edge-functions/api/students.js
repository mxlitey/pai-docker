// 学员查询 API
// GET /api/students          -> 获取所有学员
// GET /api/students?q=张伟   -> 按姓名搜索（精确+模糊）
import { getStudents, json } from '../_lib/store.js'

export default async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()

  let students = await getStudents()

  if (q) {
    // 精确匹配优先，模糊匹配其次
    const exact = students.filter((s) => s.name === q)
    const fuzzy = students.filter(
      (s) => s.name !== q && s.name.includes(q)
    )
    students = [...exact, ...fuzzy]
  }

  return json({ code: 0, message: 'ok', data: { students } })
}
