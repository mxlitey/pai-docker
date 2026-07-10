// 更新课程 API
// PUT /api/course-update  body: { course }
import { updateCourse, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit, buildUpdateSummary } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateCourse(c) {
  if (!c) throw new Error('课程数据不能为空')
  if (!c.id) throw new Error('缺少 id')
  if (!c.name) throw new Error('缺少 name')
  if (typeof c.name !== 'string' || c.name.length > 64) {
    throw new Error('name 需为 1-64 字符的字符串')
  }
  // 年级必填
  if (!c.grade || !String(c.grade).trim()) {
    throw new Error('缺少 grade（年级为必填项）')
  }
  if (c.color !== undefined && c.color !== null && typeof c.color !== 'string') {
    throw new Error('color 需为字符串')
  }
  if (c.billingType && !['per_lesson', 'per_term', 'per_month'].includes(c.billingType)) {
    throw new Error('billingType 仅允许 per_lesson / per_term / per_month')
  }
  if (c.status && !['active', 'inactive'].includes(c.status)) {
    throw new Error('status 仅允许 active / inactive')
  }
}

export default async function onRequestPut(context) {
  const authFail = await requirePermission(context, 'courses:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { course } = body

  if (!course) {
    return json(
      { code: 1, message: '请求体需包含 course 字段', data: null },
      400,
    )
  }

  try {
    validateCourse(course)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    // 注意：必须包含全部字段，否则 store 层会用默认值覆盖，导致数据丢失
    const finalCourse = {
      id: course.id.trim(),
      name: course.name.trim(),
      grade: course.grade ? course.grade.trim() : '',
      color: course.color || '',
      billingType: course.billingType || 'per_lesson',
      term: course.term || '',
      status: course.status || 'active',
      category: course.category || '',
      description: course.description || '',
    }

    const result = await updateCourse(finalCourse)
    if (result.notFound) {
      return json(
        { code: 1, message: `课程 id="${finalCourse.id}" 不存在`, data: null },
        404,
      )
    }
    const before = result.before || null
    const after = result.after || finalCourse
    await writeAudit(context, {
      action: 'update',
      module: 'courses',
      targetType: 'course',
      targetId: finalCourse.id,
      targetName: finalCourse.name,
      summary: buildUpdateSummary('courses', finalCourse.name, before, after),
      before,
      after,
    })
    return json({
      code: 0,
      message: '课程已更新',
      data: { ...result, course: after },
    })
  } catch (e) {
    console.error('[course-update] 更新异常:', e?.message || String(e))
    return json(
      { code: 1, message: '更新失败，请稍后重试', data: null },
      500,
    )
  }
}
