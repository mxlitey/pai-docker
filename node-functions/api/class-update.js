// 更新班级 API
// PUT /api/class-update  body: { class: { id, name, courseId?, teacher?, location?, color?, defaultStartTime?, defaultEndTime?, capacity?, status?, remark? } }
import { updateClass, getCourseById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit, buildUpdateSummary } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateClass(c) {
  if (!c) throw new Error('班级数据不能为空')
  if (!c.id) throw new Error('缺少 id')
  if (!c.name || typeof c.name !== 'string') throw new Error('缺少 name')
  if (c.name.trim().length > 64) throw new Error('name 需为 1-64 字符的字符串')
  // 年级必填
  if (!c.grade || !String(c.grade).trim()) {
    throw new Error('缺少 grade（年级为必填项）')
  }
  if (c.status && !['active', 'inactive'].includes(c.status)) {
    throw new Error('status 仅允许 active / inactive')
  }
}

export default async function onRequestPut(context) {
  const authFail = await requirePermission(context, 'classes:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { class: cls } = body

  if (!cls) {
    return json({ code: 1, message: '请求体需包含 class 字段', data: null }, 400)
  }

  try {
    validateClass(cls)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    const finalClass = {
      id: cls.id.trim(),
      name: cls.name.trim(),
      courseId: cls.courseId !== undefined ? (cls.courseId ? cls.courseId.trim() : '') : undefined,
      grade: cls.grade !== undefined ? cls.grade.trim() : undefined,
      teacher: cls.teacher !== undefined ? cls.teacher.trim() : undefined,
      location: cls.location !== undefined ? cls.location.trim() : undefined,
      color: cls.color !== undefined ? cls.color.trim() : undefined,
      defaultStartTime: cls.defaultStartTime !== undefined ? cls.defaultStartTime.trim() : undefined,
      defaultEndTime: cls.defaultEndTime !== undefined ? cls.defaultEndTime.trim() : undefined,
      capacity: cls.capacity !== undefined && cls.capacity !== '' ? Number(cls.capacity) : undefined,
      status: cls.status || undefined,
      remark: cls.remark !== undefined ? cls.remark.trim() : undefined,
    }
    if (finalClass.courseId) {
      const course = await getCourseById(finalClass.courseId)
      if (!course) {
        return json({ code: 1, message: `课程 id="${finalClass.courseId}" 不存在`, data: null }, 404)
      }
      // 班级年级与课程年级须一致
      const clsGrade = finalClass.grade
      if (course.grade && clsGrade && course.grade !== clsGrade) {
        return json({ code: 1, message: `班级年级「${clsGrade}」与课程年级「${course.grade}」不一致`, data: null }, 400)
      }
    }
    const result = await updateClass(finalClass)
    if (result.notFound) {
      return json({ code: 1, message: '班级不存在', data: null }, 404)
    }
    const before = result.before || null
    const after = result.after || finalClass
    await writeAudit(context, {
      action: 'update',
      module: 'classes',
      targetType: 'class',
      targetId: finalClass.id,
      targetName: after?.name || finalClass.name,
      summary: buildUpdateSummary('classes', after?.name || finalClass.name, before, after),
      before,
      after,
    })
    return json({ code: 0, message: '班级已更新', data: result })
  } catch (e) {
    console.error('[class-update] 更新异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '更新失败，请稍后重试', data: null }, 500)
  }
}
