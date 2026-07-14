// 更新年级 API
// PUT /api/grade-update  body: { grade: { id, name, sortOrder?, status?, description? } }
// 年级重命名时后端会级联更新 students.grade / courses.grade
import { updateGrade, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit, buildUpdateSummary } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateGrade(g) {
  if (!g) throw new Error('年级数据不能为空')
  if (!g.id) throw new Error('缺少 id')
  if (!g.name || typeof g.name !== 'string') throw new Error('缺少 name')
  if (g.name.trim().length > 32) throw new Error('name 需为 1-32 字符的字符串')
  if (g.sortOrder !== undefined && g.sortOrder !== null && g.sortOrder !== '') {
    const n = Number(g.sortOrder)
    if (!Number.isFinite(n)) throw new Error('sortOrder 需为数字')
  }
  if (g.status && !['active', 'inactive'].includes(g.status)) {
    throw new Error('status 仅允许 active / inactive')
  }
}

export default async function onRequestPut(context) {
  const authFail = await requirePermission(context, 'grades:update')
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
      id: grade.id.trim(),
      name: grade.name.trim(),
      sortOrder: grade.sortOrder !== undefined && grade.sortOrder !== '' ? Number(grade.sortOrder) : 0,
      status: grade.status || 'active',
      description: grade.description ? grade.description.trim() : '',
    }
    const result = await updateGrade(finalGrade)
    if (result.notFound) {
      return json({ code: 1, message: '年级不存在', data: null }, 404)
    }
    if (result.duplicateName) {
      return json({ code: 1, message: `年级名称「${finalGrade.name}」已存在`, data: { duplicateName: true } }, 409)
    }
    const before = result.before || null
    const after = result.after || finalGrade
    await writeAudit(context, {
      action: 'update',
      module: 'grades',
      targetType: 'grade',
      targetId: finalGrade.id,
      targetName: finalGrade.name,
      summary: result.renamed
        ? `重命名年级「${result.oldName}」→「${result.newName}」并级联更新学员/课程`
        : buildUpdateSummary('grades', finalGrade.name, before, after),
      before,
      after,
    })
    return json({ code: 0, message: '年级已更新', data: result })
  } catch (e) {
    console.error('[grade-update] 更新异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '更新失败，请稍后重试', data: null }, 500)
  }
}
