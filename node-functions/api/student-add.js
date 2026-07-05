// 新增学员 API
// POST /api/student-add  body: { student }
// 用于后台学员管理页面新增单个学员
import { addStudent, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

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
  if (!s.id) throw new Error('缺少 id')
  if (typeof s.id !== 'string' || s.id.length > 64) {
    throw new Error('id 需为 1-64 字符的字符串')
  }
  if (!s.name) throw new Error('缺少 name')
  if (typeof s.name !== 'string' || s.name.length > 32) {
    throw new Error('name 需为 1-32 字符的字符串')
  }
  if (s.phone && !/^[0-9+\-\s]{6,20}$/.test(s.phone)) {
    throw new Error('phone 格式不正确')
  }
  if (s.grade && typeof s.grade !== 'string') {
    throw new Error('grade 需为字符串')
  }
  // 课时校验：选填，需为非负整数
  if (s.hours !== undefined && s.hours !== null && s.hours !== '') {
    const n = Number(s.hours)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error('hours 需为非负整数')
    }
  }
}

export default async function onRequestPost(context) {
  const authFail = await requireAuth(context)
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
    // 规整字段，避免脏数据落库
    // 课时：新增时 remainingHours = hours（无 hours 则两者都不设置）
    const hours =
      student.hours !== undefined && student.hours !== null && student.hours !== ''
        ? Number(student.hours)
        : undefined
    const finalStudent = {
      id: student.id.trim(),
      name: student.name.trim(),
      phone: student.phone ? student.phone.trim() : '',
      grade: student.grade ? student.grade.trim() : '',
      ...(hours !== undefined ? { hours, remainingHours: hours } : {}),
    }

    const result = await addStudent(finalStudent)
    if (result.exists) {
      return json(
        { code: 1, message: `学员 id="${finalStudent.id}" 已存在，不可重复新增`, data: null },
        409,
      )
    }
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
