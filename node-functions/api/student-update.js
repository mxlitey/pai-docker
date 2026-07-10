// 更新学员 API
// PUT /api/student-update  body: { student }
// 若姓名变更，级联更新该学员所有排课中的 studentName
// 课时不再由学员维护（改为报名记录 enrollment 维护），更新学员仅支持修改姓名/年级
import { updateStudent, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit, buildUpdateSummary } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验学员记录必填字段与格式（与 student-add 规则一致）
function validateStudent(s) {
  if (!s) throw new Error('学员数据不能为空')
  if (!s.id) throw new Error('缺少 id')
  if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.id)) {
    throw new Error('id 仅允许字母、数字、下划线、短横线，长度 1-64')
  }
  if (!s.name) throw new Error('缺少 name')
  if (typeof s.name !== 'string' || s.name.length > 32) {
    throw new Error('name 需为 1-32 字符的字符串')
  }
  // 手机必填
  if (!s.phone || !String(s.phone).trim()) {
    throw new Error('缺少 phone（手机号为必填项）')
  }
  // 年级必填
  if (!s.grade || !String(s.grade).trim()) {
    throw new Error('缺少 grade（年级为必填项）')
  }
  if (typeof s.grade !== 'string') {
    throw new Error('grade 需为字符串')
  }
}

export default async function onRequestPut(context) {
  const authFail = await requirePermission(context, 'students:update')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { student } = body

  if (!student) {
    return json(
      { code: 1, message: '请求体需包含 student 字段', data: null },
      400,
    )
  }

  try {
    validateStudent(student)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    // 课时不再由学员维护，更新仅处理姓名/年级
    const finalStudent = {
      id: student.id.trim(),
      name: student.name.trim(),
      grade: student.grade ? student.grade.trim() : '',
      phone: student.phone || '',
      parentName: student.parentName || '',
      gender: student.gender || '',
      birthday: student.birthday || '',
      status: student.status || 'active',
      tags: student.tags || '',
      remark: student.remark || '',
      source: student.source || '',
    }

    const result = await updateStudent(finalStudent)
    if (result.notFound) {
      return json(
        { code: 1, message: `学员 id="${finalStudent.id}" 不存在`, data: null },
        404,
      )
    }
    const before = result.before || null
    const after = result.after || finalStudent
    await writeAudit(context, {
      action: 'update',
      module: 'students',
      targetType: 'student',
      targetId: finalStudent.id,
      targetName: finalStudent.name,
      summary: buildUpdateSummary('students', finalStudent.name, before, after),
      before,
      after,
    })
    return json({
      code: 0,
      message: result.nameChanged
        ? `学员已更新，并同步更新 ${result.updatedScheduleFiles} 个排课文件中的姓名`
        : '学员已更新',
      data: { ...result, student: after },
    })
  } catch (e) {
    console.error('[student-update] 更新异常:', e?.message || String(e))
    return json(
      { code: 1, message: '更新失败，请稍后重试', data: null },
      500,
    )
  }
}
