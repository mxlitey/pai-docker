// 退课 API（重构后的结转第一步）
// POST /api/transfer-add  body: { transfer: { studentId, fromEnrollmentId, giftMode, note? } }
// 退课：源报名剩余课时按报名单价折算成金额，存入学员账户余额；源报名标记 settled。
// giftMode: 'discard'（默认，赠课作废）/ 'refund'（赠课也折算）
import { refundEnrollment, getStudentById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateTransfer(t) {
  if (!t) throw new Error('退课数据不能为空')
  if (!t.studentId) throw new Error('缺少 studentId')
  if (!t.fromEnrollmentId) throw new Error('缺少 fromEnrollmentId（源报名记录）')
  if (t.giftMode && !['discard', 'refund'].includes(t.giftMode)) {
    throw new Error('giftMode 仅允许 discard / refund')
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
      id: transfer.id || undefined,
      studentId: transfer.studentId.trim(),
      fromEnrollmentId: transfer.fromEnrollmentId.trim(),
      giftMode: transfer.giftMode || 'discard',
      note: transfer.note ? String(transfer.note).slice(0, 500) : '',
      reason: transfer.reason || '',
      operatorId: context.admin?.id || '',
    }
    const result = await refundEnrollment({ transfer: finalTransfer })
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
      summary: `退课「${studentName}」：折算 ¥${result.refundAmount} 入账户（${result.giftMode === 'refund' ? '赠课折算' : '赠课作废'}，余额 ¥${result.balanceAfter}）`,
      after: {
        refundAmount: result.refundAmount,
        refundHours: result.refundHours,
        giftMode: result.giftMode,
        balanceAfter: result.balanceAfter,
      },
    })
    const cancelNote = result.cancelledSchedules > 0
      ? `，已取消 ${result.cancelledSchedules} 节未来排课`
      : ''
    return json({
      code: 0,
      message: `已退课：折算 ¥${result.refundAmount} 入账户余额，当前余额 ¥${result.balanceAfter}${cancelNote}`,
      data: result,
    })
  } catch (e) {
    console.error('[transfer-add] 退课异常:', e?.message || String(e))
    // 业务异常（中文 message）返回给用户，系统异常脱敏
    const msg = e?.message || ''
    const message = /[\u4e00-\u9fa5]/.test(msg) ? msg : '操作失败，请稍后重试'
    return json({ code: 1, message, data: null }, 500)
  }
}
