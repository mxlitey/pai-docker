// 家长端 H5 访问 API（无需管理员登录，凭专属链接 token + 手机号后4位二次校验）
//
// GET  /api/parent-access?s=studentId&t=token
//   → 校验 token 签名，返回脱敏的学员名与手机号提示，供 H5 渲染验证页
// POST /api/parent-access  body: { studentId, token, phoneSuffix }
//   → 二次校验手机号后4位，通过后返回学员信息 + 近期排课 + 报名余额 + 教师课后反馈
import {
  json,
  getStudentById,
  getAllSchedulesByStudent,
  getEnrollments,
  getFeedback,
} from '../_lib/store.js'
import { verifyParentToken, getTokenSecret } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function phoneLast4(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  return digits.slice(-4)
}

// 脱敏学员名：2字→保留首字，3字及以上→保留首尾
function maskName(name) {
  if (!name) return '学员'
  if (name.length <= 1) return name + '*'
  if (name.length === 2) return name[0] + '*'
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
}

// 校验 token 并匹配 studentId，返回 payload 或 null
async function checkToken(studentId, token) {
  if (!studentId || !token) return null
  const secret = getTokenSecret()
  const payload = await verifyParentToken(token, secret)
  if (!payload) return null
  if (payload.sid !== studentId) return null
  return payload
}

// GET：返回脱敏提示信息（不泄露学员全名与完整手机号）
export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const studentId = url.searchParams.get('s')
  const token = url.searchParams.get('t')
  const payload = await checkToken(studentId, token)
  if (!payload) {
    return json({ code: 1, message: '链接无效或已失效，请联系老师获取新的专属链接', data: null }, 403)
  }
  const student = await getStudentById(studentId)
  if (!student) {
    return json({ code: 1, message: '学员信息不存在', data: null }, 404)
  }
  return json({
    code: 0,
    message: 'ok',
    data: {
      studentId,
      studentName: maskName(student.name),
      // 提示家长输入登记手机号的后4位
      phoneHint: '请输入报名时登记的手机号后 4 位',
    },
  })
}

// POST：二次校验手机号后4位，通过后返回完整数据
export async function onRequestPost(context) {
  const { request } = context
  const body = await readBody(request)
  const { studentId, token, phoneSuffix } = body
  const payload = await checkToken(studentId, token)
  if (!payload) {
    return json({ code: 1, message: '链接无效或已失效', data: null }, 403)
  }

  const input = String(phoneSuffix || '').replace(/\D/g, '').slice(-4)
  if (!input) {
    return json({ code: 1, message: '请输入手机号后 4 位', data: null }, 400)
  }
  // 双重比对：与 token 内 ps 一致，且与学员当前手机号后4位一致
  const student = await getStudentById(studentId)
  if (!student) {
    return json({ code: 1, message: '学员信息不存在', data: null }, 404)
  }
  const actualPs = phoneLast4(student.phone)
  if (input !== payload.ps || input !== actualPs) {
    return json({ code: 1, message: '手机号后 4 位不正确，请核对后重试', data: null }, 403)
  }

  // 校验通过，聚合家长可见数据
  // 排课：返回从今天起未来 90 天 + 过去 30 天，便于家长查看近期安排
  const today = new Date()
  const past = new Date(today.getTime() - 30 * 86400000)
  const future = new Date(today.getTime() + 90 * 86400000)
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  let schedules = []
  try {
    schedules = await getAllSchedulesByStudent(studentId)
    schedules = schedules.filter((s) => s.date >= fmt(past) && s.date <= fmt(future))
    schedules.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return (a.startTime || '').localeCompare(b.startTime || '')
    })
  } catch (e) {
    console.error('[parent-access] 加载排课失败:', e?.message || String(e))
  }

  // 报名余额：仅返回 active 且仍有课时或金额的记录摘要
  let enrollments = []
  try {
    const all = await getEnrollments({ studentId, status: 'active' })
    enrollments = all.map((e) => ({
      courseId: e.courseId,
      courseName: '', // 课程名由前端按需展开，此处仅给余额
      status: e.status,
      purchasedHours: e.purchasedHours,
      giftHours: e.giftHours,
      remainingHours: (e.remainingPaidHours || 0) + (e.remainingGiftHours || 0),
      remainingPaidHours: e.remainingPaidHours,
      remainingGiftHours: e.remainingGiftHours,
      expiredAt: e.expiredAt || '',
    }))
  } catch (e) {
    console.error('[parent-access] 加载报名失败:', e?.message || String(e))
  }

  // 教师课后反馈：家长可见教师对该学员的反馈
  let feedback = []
  try {
    feedback = await getFeedback({ studentId })
  } catch (e) {
    console.error('[parent-access] 加载反馈失败:', e?.message || String(e))
  }

  return json({
    code: 0,
    message: 'ok',
    data: {
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade || '',
        parentName: student.parentName || '',
      },
      schedules,
      enrollments,
      feedback,
    },
  })
}
