// 账户充值 API
// POST /api/account-recharge  body: { studentId, amount, note? }
import { rechargeAccount, getStudentById, json } from '../_lib/store.js'
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
  const authFail = await requirePermission(context, 'accounts:recharge')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { studentId, amount, note } = body

  if (!studentId) {
    return json({ code: 1, message: '缺少 studentId', data: null }, 400)
  }
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return json({ code: 1, message: 'amount 需为正数', data: null }, 400)
  }

  try {
    const result = await rechargeAccount({
      studentId: studentId.trim(),
      amount: amt,
      note: note ? String(note).slice(0, 500) : '',
    })
    let studentName = studentId
    try {
      const s = await getStudentById(studentId)
      if (s) studentName = s.name
    } catch {}
    await writeAudit(context, {
      action: 'create',
      module: 'accounts',
      targetType: 'account',
      targetId: studentId,
      targetName: studentName,
      summary: `账户充值「${studentName}」+¥${amt}（余额 ¥${result.balanceAfter}）`,
      after: { type: 'recharge', amount: amt, balanceAfter: result.balanceAfter },
    })
    return json({ code: 0, message: `已充值 ¥${amt}，当前余额 ¥${result.balanceAfter}`, data: result })
  } catch (e) {
    console.error('[account-recharge] 异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '充值失败', data: null }, 500)
  }
}
