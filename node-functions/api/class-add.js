// 新增班级 API
// POST /api/class-add  body: { class: { name, courseId?, teacher?, location?, color?, defaultStartTime?, defaultEndTime?, capacity?, status?, remark? } }
import { addClass, getCourseById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateClass(c) {
  if (!c) throw new Error('班级数据不能为空')
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

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'classes:create')
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
      id: cls.id ? cls.id.trim() : '',
      name: cls.name.trim(),
      courseId: cls.courseId ? cls.courseId.trim() : '',
      grade: cls.grade ? cls.grade.trim() : '',
      teacher: cls.teacher ? cls.teacher.trim() : '',
      location: cls.location ? cls.location.trim() : '',
      color: cls.color ? cls.color.trim() : '',
      defaultStartTime: cls.defaultStartTime ? cls.defaultStartTime.trim() : '',
      defaultEndTime: cls.defaultEndTime ? cls.defaultEndTime.trim() : '',
      capacity: cls.capacity !== undefined && cls.capacity !== '' ? Number(cls.capacity) : 0,
      status: cls.status || 'active',
      remark: cls.remark ? cls.remark.trim() : '',
    }
    // 若关联课程，校验课程存在
    if (finalClass.courseId) {
      const course = await getCourseById(finalClass.courseId)
      if (!course) {
        return json({ code: 1, message: `课程 id="${finalClass.courseId}" 不存在`, data: null }, 404)
      }
      // 班级年级与课程年级须一致
      if (course.grade && finalClass.grade && course.grade !== finalClass.grade) {
        return json({ code: 1, message: `班级年级「${finalClass.grade}」与课程年级「${course.grade}」不一致`, data: null }, 400)
      }
      // 未填颜色时从课程带入
      if (!finalClass.color && course.color) finalClass.color = course.color
    }

    const result = await addClass(finalClass)
    if (result.exists) {
      return json({ code: 1, message: `班级 id="${finalClass.id}" 已存在`, data: null }, 409)
    }
    if (result.class && result.class.id) finalClass.id = result.class.id
    await writeAudit(context, {
      action: 'create',
      module: 'classes',
      targetType: 'class',
      targetId: finalClass.id,
      targetName: finalClass.name,
      summary: `新增班级「${finalClass.name}」` + (finalClass.courseId ? `（关联课程 ${finalClass.courseId}）` : ''),
      after: finalClass,
    })
    return json({ code: 0, message: '班级已新增', data: { ...result, class: finalClass } })
  } catch (e) {
    console.error('[class-add] 新增异常:', e?.message || String(e))
    return json({ code: 1, message: e.message || '新增失败，请稍后重试', data: null }, 500)
  }
}
