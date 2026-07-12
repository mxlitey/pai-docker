// 删除学员 API
// DELETE /api/student-delete  body: { studentId }
// 删除指定学员及其所有排课数据
// 业务约束：
//   - 有剩余课时的报名记录存在时，禁止删除（须先走退课流程）
//   - 账户有余额时允许删除，但返回提示需退费
import { deleteStudentWithSchedules, getDb, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestDelete(context) {
  const authFail = await requirePermission(context, 'students:delete')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { studentId } = body

  if (!studentId) {
    return json(
      { code: 1, message: '需提供 studentId 字段', data: null },
      400,
    )
  }

  try {
    const db = getDb()

    // 检查是否存在有剩余课时的报名记录
    const enrollmentsWithHours = db.prepare(
      `SELECT id, course_id, remaining_paid_hours, remaining_gift_hours
       FROM enrollments
       WHERE student_id=? AND status='active'
         AND (remaining_paid_hours > 0 OR remaining_gift_hours > 0)`,
    ).all(studentId)

    if (enrollmentsWithHours.length > 0) {
      const totalPaid = enrollmentsWithHours.reduce((s, e) => s + e.remaining_paid_hours, 0)
      const totalGift = enrollmentsWithHours.reduce((s, e) => s + e.remaining_gift_hours, 0)
      return json({
        code: 1,
        message: `该学员有 ${enrollmentsWithHours.length} 条报名记录含剩余课时（付费 ${totalPaid} + 赠课 ${totalGift}），请先走退课流程后再删除`,
        data: { enrollmentsWithHours, totalPaidHours: totalPaid, totalGiftHours: totalGift },
      }, 400)
    }

    // 检查账户余额
    const stu = db.prepare('SELECT balance FROM students WHERE id=?').get(studentId)
    const balance = stu ? Number(stu.balance || 0) : 0

    const result = await deleteStudentWithSchedules(studentId)
    if (!result.studentRemoved) {
      return json({
        code: 0,
        message: '未找到该学员（已清理其残留排课文件）',
        data: result,
      })
    }
    const before = result.before || null
    const studentName = before?.name || studentId

    // 有余额时在返回消息中提示退费
    const balanceHint = balance > 0
      ? `，账户余额 ${balance.toFixed(2)} 元需退费`
      : ''
    const auditSummary = `删除学员「${studentName}」` +
      (result.deletedScheduleFiles > 0 ? `（同时清理 ${result.deletedScheduleFiles} 个排课文件）` : '') +
      balanceHint

    await writeAudit(context, {
      action: 'delete',
      module: 'students',
      targetType: 'student',
      targetId: studentId,
      targetName: studentName,
      summary: auditSummary,
      before,
    })
    return json({
      code: 0,
      message: `学员已删除，清理 ${result.deletedScheduleFiles} 个排课文件${balanceHint}`,
      data: { ...result, balanceRefunded: balance > 0 },
    })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[student-delete] 删除异常:', e?.message || String(e))
    return json(
      { code: 1, message: '删除失败，请稍后重试', data: null },
      500,
    )
  }
}
