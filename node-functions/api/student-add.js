// 新增学员 API
// POST /api/student-add  body: { student }
// 用于后台学员管理页面新增单个学员
import { addStudent, getDb, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验学员记录必填字段与格式
function validateStudent(s) {
  if (!s) throw new Error('学员数据不能为空')
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
  // 年级必须存在于 grades 表中（与前端 select 下拉约束一致）
  const db = getDb()
  const gradeRow = db.prepare("SELECT 1 FROM grades WHERE name=? AND status='active'").get(s.grade.trim())
  if (!gradeRow) {
    throw new Error(`年级「${s.grade.trim()}」不存在或已停用，请先在年级管理中创建`)
  }
  // 课时不再由学员维护（改为报名记录 enrollment 维护），忽略前端可能传入的 hours 字段
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'students:create')
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
    // 课时不再由学员维护（改为报名记录 enrollment 维护），新增学员只保存基础信息
    const finalStudent = {
      id: student.id ? student.id.trim() : '',
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

    const result = await addStudent(finalStudent)
    if (result.exists) {
      return json(
        { code: 1, message: `学员 id="${finalStudent.id}" 已存在，不可重复新增`, data: null },
        409,
      )
    }
    // 回填后端生成的 id，保证审计与响应一致
    if (result.student && result.student.id) finalStudent.id = result.student.id
    await writeAudit(context, {
      action: 'create',
      module: 'students',
      targetType: 'student',
      targetId: finalStudent.id,
      targetName: finalStudent.name,
      summary: `新增学员「${finalStudent.name}」` + (finalStudent.grade ? `（${finalStudent.grade}）` : ''),
      after: finalStudent,
    })
    return json({
      code: 0,
      message: '学员已新增',
      data: { ...result, student: finalStudent },
    })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[student-add] 新增异常:', e?.message || String(e))
    return json(
      { code: 1, message: '新增失败，请稍后重试', data: null },
      500,
    )
  }
}
