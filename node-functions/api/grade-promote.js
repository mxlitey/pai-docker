// 批量升班 API
// POST /api/grade-promote  body: { fromGradeName, toGradeName }
// 将 fromGradeName 年级的所有学员年级更新为 toGradeName（用于学年末整体升班）
import { promoteStudents, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'grades:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { fromGradeName, toGradeName } = body

  if (!fromGradeName || !toGradeName) {
    return json({ code: 1, message: '缺少 fromGradeName 或 toGradeName', data: null }, 400)
  }

  try {
    const result = await promoteStudents(String(fromGradeName).trim(), String(toGradeName).trim())
    if (result.same) {
      return json({ code: 1, message: '源年级与目标年级相同，无需升班', data: null }, 400)
    }
    await writeAudit(context, {
      action: 'promote',
      module: 'grades',
      targetType: 'grade',
      targetId: '',
      targetName: `${fromGradeName} → ${toGradeName}`,
      summary: `批量升班：${result.promoted} 名学员从「${fromGradeName}」升至「${toGradeName}」`,
      after: { fromGradeName, toGradeName, promoted: result.promoted },
    })
    return json({
      code: 0,
      message: `已将 ${result.promoted} 名学员从「${fromGradeName}」升至「${toGradeName}」`,
      data: result,
    })
  } catch (e) {
    console.error('[grade-promote] 升班异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '升班失败，请稍后重试', data: null }, 500)
  }
}
