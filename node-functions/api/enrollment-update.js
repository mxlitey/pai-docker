// 更新报名 API
// PUT /api/enrollment-update  body: { enrollment }
// 用途：续费（purchasedHours 增量）、补赠课（giftHours 增量）、修改单价/金额/备注/状态
// 课时为「绝对值」语义：传入的新值与旧值之差即增量，剩余按差值同步调整
import { updateEnrollment, getEnrollment, getStudents, getCourses, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

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
  if (e.status && !['active', 'settled', 'finished'].includes(e.status)) {
    throw new Error('status 仅允许 active / settled / finished')
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

  try {
    const finalEnrollment = {
      id: enrollment.id.trim(),
      ...(enrollment.purchasedHours !== undefined ? { purchasedHours: Number(enrollment.purchasedHours) } : {}),
      ...(enrollment.giftHours !== undefined ? { giftHours: Number(enrollment.giftHours) } : {}),
      ...(enrollment.unitPrice !== undefined ? { unitPrice: Number(enrollment.unitPrice) } : {}),
      ...(enrollment.totalAmount !== undefined ? { totalAmount: Number(enrollment.totalAmount) } : {}),
      ...(enrollment.paidAmount !== undefined ? { paidAmount: Number(enrollment.paidAmount) } : {}),
      // 有效期：透传给 store（空串表示清除有效期）；store 用 ?? 兜底保留旧值
      ...(enrollment.expiredAt !== undefined ? { expiredAt: String(enrollment.expiredAt).slice(0, 10) } : {}),
      ...(enrollment.status ? { status: enrollment.status } : {}),
      ...(enrollment.note !== undefined ? { note: String(enrollment.note).slice(0, 500) } : {}),
    }

    const result = await updateEnrollment(finalEnrollment)
    if (result.notFound) {
      return json({ code: 1, message: `报名 id="${finalEnrollment.id}" 不存在`, data: null }, 404)
    }
    // 获取学员名与课程名用于审计
    let studentName = finalEnrollment.id
    let courseName = ''
    try {
      const enr = await getEnrollment(finalEnrollment.id)
      if (enr) {
        const students = await getStudents()
        const courses = await getCourses()
        const s = students.find((x) => x.id === enr.studentId)
        const c = courses.find((x) => x.id === enr.courseId)
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
      summary: `更新报名 ${studentName} ${courseName}`.trim(),
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
