// 更新报名 API
// PUT /api/enrollment-update  body: { enrollment }
// 用途：续费（purchasedHours 增量）、补赠课（giftHours 增量）、修改单价/金额/备注/状态
// 课时为「绝对值」语义：传入的新值与旧值之差即增量，剩余按差值同步调整
import { updateEnrollment, getEnrollment, getStudentById, getCourseById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit, buildUpdateSummary } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateEnrollment(e) {
  if (!e) throw new Error('报名数据不能为空')
  if (!e.id) throw new Error('缺少 id')
  if (e.purchasedHours !== undefined) {
    const n = Number(e.purchasedHours)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error('purchasedHours 需为非负整数')
    }
  }
  if (e.giftHours !== undefined) {
    const n = Number(e.giftHours)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error('giftHours 需为非负整数')
    }
  }
  if (e.unitPrice !== undefined) {
    const n = Number(e.unitPrice)
    if (!Number.isFinite(n) || n < 0) throw new Error('unitPrice 需为非负数')
  }
  if (e.status && !['active', 'settled', 'expired'].includes(e.status)) {
    throw new Error('status 仅允许 active / settled / expired')
  }
}

export default async function onRequestPut(context) {
  const authFail = await requirePermission(context, 'enrollments:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { enrollment } = body

  if (!enrollment) {
    return json({ code: 1, message: '请求体需包含 enrollment 字段', data: null }, 400)
  }

  try {
    validateEnrollment(enrollment)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  // Bug10 修复：改为 settled 状态时，剩余课时必须为 0
  // 否则课时会凭空消失，须先走退课流程消耗或退回课时
  if (enrollment.status === 'settled') {
    try {
      const current = await getEnrollment(enrollment.id.trim())
      if (current) {
        // 计算更新后的剩余课时（若同时传了 purchasedHours/giftHours 则按新值计算）
        const newPurchased = enrollment.purchasedHours !== undefined
          ? Number(enrollment.purchasedHours) : current.purchasedHours
        const newGift = enrollment.giftHours !== undefined
          ? Number(enrollment.giftHours) : current.giftHours
        const purchasedDelta = newPurchased - current.purchasedHours
        const giftDelta = newGift - current.giftHours
        const remainPaid = Math.max(0, current.remainingPaidHours + purchasedDelta)
        const remainGift = Math.max(0, current.remainingGiftHours + giftDelta)
        if (remainPaid > 0 || remainGift > 0) {
          return json({
            code: 1,
            message: `剩余课时不为 0（付费 ${remainPaid} + 赠课 ${remainGift}），不可直接结转，请先走退课流程消耗或退回课时`,
            data: { remainingPaidHours: remainPaid, remainingGiftHours: remainGift },
          }, 400)
        }
      }
    } catch {
      // 查询失败不阻塞，让后续 updateEnrollment 处理 notFound
    }
  }

  try {
    const finalEnrollment = {
      id: enrollment.id.trim(),
      ...(enrollment.purchasedHours !== undefined ? { purchasedHours: Number(enrollment.purchasedHours) } : {}),
      ...(enrollment.giftHours !== undefined ? { giftHours: Number(enrollment.giftHours) } : {}),
      ...(enrollment.unitPrice !== undefined ? { unitPrice: Number(enrollment.unitPrice) } : {}),
      ...(enrollment.totalAmount !== undefined ? { totalAmount: Number(enrollment.totalAmount) } : {}),
      ...(enrollment.paidAmount !== undefined ? { paidAmount: Number(enrollment.paidAmount) } : {}),
      // 报名不再设置有效期，强制清空（忽略前端传入）
      expiredAt: '',
      ...(enrollment.status ? { status: enrollment.status } : {}),
      ...(enrollment.note !== undefined ? { note: String(enrollment.note).slice(0, 500) } : {}),
    }

    const result = await updateEnrollment(finalEnrollment)
    if (result.notFound) {
      return json({ code: 1, message: `报名 id="${finalEnrollment.id}" 不存在`, data: null }, 404)
    }
    const before = result.before || null
    const after = result.after || null
    // 获取学员名与课程名用于审计
    let studentName = before?.studentId || finalEnrollment.id
    let courseName = ''
    try {
      const enr = await getEnrollment(finalEnrollment.id)
      if (enr) {
        const s = await getStudentById(enr.studentId)
        const c = await getCourseById(enr.courseId)
        studentName = s?.name || enr.studentId
        courseName = c?.name || enr.courseId
      }
    } catch {}
    await writeAudit(context, {
      action: 'update',
      module: 'enrollments',
      targetType: 'enrollment',
      targetId: finalEnrollment.id,
      targetName: `${studentName} ${courseName}`.trim(),
      summary: buildUpdateSummary('enrollments', `${studentName} ${courseName}`.trim(), before, after),
      before,
      after,
    })
    return json({
      code: 0,
      message: '报名已更新',
      data: result,
    })
  } catch (e) {
    console.error('[enrollment-update] 更新异常:', e?.message || String(e))
    return json({ code: 1, message: '更新失败，请稍后重试', data: null }, 500)
  }
}
