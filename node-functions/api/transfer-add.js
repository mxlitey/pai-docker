// 新增结转 API
// POST /api/transfer-add  body: { transfer: { studentId, fromEnrollmentId, toEnrollmentId, mode, note } }
// mode: 'amount'(默认，按金额折算) / 'hours'(按课时平移)
import { addTransfer, getStudentById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'
import { genTransferId } from '../_lib/id.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateTransfer(t) {
  if (!t) throw new Error('结转数据不能为空')
  if (!t.studentId) throw new Error('缺少 studentId')
  if (!t.fromEnrollmentId) throw new Error('缺少 fromEnrollmentId（源报名记录）')
  if (!t.toEnrollmentId) throw new Error('缺少 toEnrollmentId（目标报名记录）')
  if (t.fromEnrollmentId === t.toEnrollmentId) {
    throw new Error('源与目标报名记录不能相同')
  }
  if (t.mode && !['amount', 'hours'].includes(t.mode)) {
    throw new Error('mode 仅允许 amount(按金额) 或 hours(按课时)')
  }
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'transfers:create')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { transfer } = body

  if (!transfer) {
    return json({ code: 1, message: '请求体需包含 transfer 字段', data: null }, 400)
  }

  try {
    validateTransfer(transfer)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    const finalTransfer = {
      id: transfer.id || genTransferId(),
      studentId: transfer.studentId.trim(),
      fromEnrollmentId: transfer.fromEnrollmentId.trim(),
      toEnrollmentId: transfer.toEnrollmentId.trim(),
      mode: transfer.mode === 'hours' ? 'hours' : 'amount',
      note: transfer.note ? String(transfer.note).slice(0, 500) : '',
    }
    const result = await addTransfer(finalTransfer)
    if (result.created === false) {
      return json({ code: 1, message: result.reason || '结转失败', data: null }, 400)
    }
    // 获取学员名用于审计
    let studentName = finalTransfer.studentId
    try {
      const found = await getStudentById(finalTransfer.studentId)
      if (found) studentName = found.name
    } catch {}
    await writeAudit(context, {
      action: 'create',
      module: 'transfers',
      targetType: 'transfer',
      targetId: result.id || '',
      targetName: studentName,
      summary: `结转 ${studentName}（${result.mode}）`,
      after: {
        transferredHours: result.transferredHours,
        transferredAmount: result.transferredAmount,
        leftoverAmount: result.leftoverAmount,
      },
    })
    return json({
      code: 0,
      message:
        result.mode === 'amount'
          ? `已按金额结转：转移 ${result.transferredHours} 课时（折合 ¥${result.transferredAmount}），目标新增 ${result.toPurchasedAdd} 课时`
          : `已按课时结转：付费 ${result.toPurchasedAdd} 课时 + 赠课 ${result.toGiftAdd} 课时`,
      data: result,
    })
  } catch (e) {
    console.error('[transfer-add] 新增异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '结转失败，请稍后重试', data: null }, 500)
  }
}
