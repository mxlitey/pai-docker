// 账户流水查询 API
// GET /api/account-transactions?studentId=xxx
import { getAccountTransactions, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

export default async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'accounts:view')
  if (authFail) return authFail
  const { request } = context
  const url = new URL(request.url)
  const studentId = url.searchParams.get('studentId') || ''
  try {
    const transactions = await getAccountTransactions(studentId ? { studentId } : {})
    return json({ code: 0, message: 'ok', data: { transactions } })
  } catch (e) {
    console.error('[account-transactions] 异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '查询失败', data: null }, 500)
  }
}
