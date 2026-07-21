// 公开学员搜索 API（无需鉴权，供公开搜索页 #search 使用）
// GET /api/public-students        -> 返回全部学员（仅 id/name/grade，脱敏）
// GET /api/public-students?q=张   -> 按姓名搜索（精确+模糊）
//
// 隐私说明：仅返回 id/name/grade，不含手机号/余额/家长姓名等敏感信息
// 家长选中学员后，跳转家长端 ?s=学员id，仍需手机号后4位验真才能查看详情
import { getStudents, json } from '../_lib/store.js'

function sanitize(s) {
  return { id: s.id, name: s.name, grade: s.grade || '' }
}

export async function onRequestGet(context) {
  const { request } = context
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  try {
    const students = await getStudents(q)
    return json({ code: 0, message: 'ok', data: { students: students.map(sanitize) } })
  } catch (e) {
    console.error('[public-students] 查询异常:', e?.message || String(e))
    return json({ code: 0, message: 'ok', data: { students: [] } })
  }
}
