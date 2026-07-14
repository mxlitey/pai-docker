// 新增年级 API
// POST /api/grade-add  body: { grade: { name, sortOrder?, status?, description? } }
import { addGrade, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateGrade(g) {
  if (!g) throw new Error('年级数据不能为空')
  if (!g.name || typeof g.name !== 'string') throw new Error('缺少 name')
  if (g.name.trim().length > 32) throw new Error('name 需为 1-32 字符的字符串')
  if (g.sortOrder !== undefined && g.sortOrder !== null && g.sortOrder !== '') {
    const n = Number(g.sortOrder)
    if (!Number.isFinite(n)) throw new Error('sortOrder 需为数字')
  }
  if (g.status && !['active', 'inactive'].includes(g.status)) {
    throw new Error('status 仅允许 active / inactive')
  }
  if (g.description && typeof g.description !== 'string') throw new Error('description 需为字符串')
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'grades:create')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { grade } = body

  if (!grade) {
    return json({ code: 1, message: '请求体需包含 grade 字段', data: null }, 400)
  }

  try {
    validateGrade(grade)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    const finalGrade = {
      id: grade.id ? grade.id.trim() : '',
      name: grade.name.trim(),
      sortOrder: grade.sortOrder !== undefined && grade.sortOrder !== '' ? Number(grade.sortOrder) : 0,
      status: grade.status || 'active',
      description: grade.description ? grade.description.trim() : '',
    }

    const result = await addGrade(finalGrade)
    if (result.exists) {
      return json({ code: 1, message: `年级 id="${finalGrade.id}" 已存在`, data: null }, 409)
    }
    if (result.duplicateName) {
      return json({ code: 1, message: `年级名称「${finalGrade.name}」已存在`, data: { duplicateName: true } }, 409)
    }
    if (result.grade && result.grade.id) finalGrade.id = result.grade.id
    await writeAudit(context, {
      action: 'create',
      module: 'grades',
      targetType: 'grade',
      targetId: finalGrade.id,
      targetName: finalGrade.name,
      summary: `新增年级「${finalGrade.name}」`,
      after: finalGrade,
    })
    return json({ code: 0, message: '年级已新增', data: { ...result, grade: finalGrade } })
  } catch (e) {
    console.error('[grade-add] 新增异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '新增失败，请稍后重试', data: null }, 500)
  }
}
