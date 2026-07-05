// 更新学员 API
// PUT /api/student-update  body: { student }
// 若姓名变更，级联更新该学员所有排课中的 studentName
import { updateStudent, getStudents, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

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
  if (s.remainingHours !== undefined && s.remainingHours !== null && s.remainingHours !== '') {
    const n = Number(s.remainingHours)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error('remainingHours 需为非负整数')
    }
  }
}

export default async function onRequestPut(context) {
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
    // 课时字段处理：
    // - 请求显式带 remainingHours -> 直接使用
    // - 仅带 hours（修改总课时）-> remainingHours 按差值调整：remaining += (newHours - oldHours)
    // - 都不带 -> 保留原值（需从 store 读旧学员记录）
    const students = await getStudents()
    const oldStudent = students.find((s) => s.id === student.id.trim())

    const newHours =
      student.hours !== undefined && student.hours !== null && student.hours !== ''
        ? Number(student.hours)
        : oldStudent?.hours
    let newRemaining
    if (
      student.remainingHours !== undefined &&
      student.remainingHours !== null &&
      student.remainingHours !== ''
    ) {
      newRemaining = Number(student.remainingHours)
    } else if (
      student.hours !== undefined &&
      student.hours !== null &&
      student.hours !== '' &&
      oldStudent
    ) {
      // 按 hours 差值调整 remaining
      const oldH = typeof oldStudent.hours === 'number' ? oldStudent.hours : 0
      const oldR = typeof oldStudent.remainingHours === 'number' ? oldStudent.remainingHours : 0
      newRemaining = oldR + (Number(student.hours) - oldH)
    } else {
      newRemaining = oldStudent?.remainingHours
    }

    const finalStudent = {
      id: student.id.trim(),
      name: student.name.trim(),
      phone: student.phone ? student.phone.trim() : '',
      grade: student.grade ? student.grade.trim() : '',
      ...(newHours !== undefined ? { hours: newHours } : {}),
      ...(newRemaining !== undefined ? { remainingHours: newRemaining } : {}),
    }

    const result = await updateStudent(finalStudent)
    if (result.notFound) {
      return json(
        { code: 1, message: `学员 id="${finalStudent.id}" 不存在`, data: null },
        404,
      )
    }
    return json({
      code: 0,
      message: result.nameChanged
        ? `学员已更新，并同步更新 ${result.updatedScheduleFiles} 个排课文件中的姓名`
        : '学员已更新',
      data: { ...result, student: finalStudent },
    })
  } catch (e) {
    console.error('[student-update] 更新异常:', e?.message || String(e))
    return json(
      { code: 1, message: '更新失败，请稍后重试', data: null },
      500,
    )
  }
}
