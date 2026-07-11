// 家长端 H5 访问 API（无需管理员登录，凭学员 ID + 手机号后4位验真）
//
// GET  /api/parent-access?s=studentId
//   → 返回脱敏的学员名与手机号提示，供 H5 渲染验证页
// POST /api/parent-access  body: { studentId, phoneSuffix }
//   → 校验手机号后4位，通过后返回学员信息 + 近期排课 + 报名余额 + 教师课后反馈
import {
  json,
  getStudentById,
  getAllSchedulesByStudent,
  getEnrollments,
  getFeedback,
  getCourseById,
} from '../_lib/store.js'
import { getClientIp } from '../_lib/auth.js'
import { checkParentAccessRateLimit } from '../_lib/rate-limit.js'

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

// GET：返回脱敏提示信息（不泄露学员全名与完整手机号）
export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const studentId = url.searchParams.get('s')
  if (!studentId) {
    return json({ code: 1, message: '链接缺少学员参数', data: null }, 400)
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
      phoneHint: '请输入报名时登记的手机号后 4 位',
    },
  })
}

// POST：校验手机号后4位，通过后返回完整数据
export async function onRequestPost(context) {
  const { request } = context
  const body = await readBody(request)
  const { studentId, phoneSuffix } = body
  if (!studentId) {
    return json({ code: 1, message: '缺少学员参数', data: null }, 400)
  }

  // 速率限制：防手机号后4位暴力枚举（每 IP/每学员 每分钟 5 次）
  const ip = getClientIp(request)
  const rl = checkParentAccessRateLimit(ip, studentId)
  if (!rl.ok) {
    return json({ code: 1, message: `验证尝试过于频繁，请 ${Math.ceil(rl.retryAfterMs / 1000)} 秒后再试`, data: null }, 429)
  }

  const input = String(phoneSuffix || '').replace(/\D/g, '').slice(-4)
  if (!input) {
    return json({ code: 1, message: '请输入手机号后 4 位', data: null }, 400)
  }
  const student = await getStudentById(studentId)
  if (!student) {
    return json({ code: 1, message: '学员信息不存在', data: null }, 404)
  }
  const actualPs = phoneLast4(student.phone)
  if (!actualPs) {
    return json({ code: 1, message: '该学员未登记手机号，请联系老师', data: null }, 400)
  }
  if (input !== actualPs) {
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
    schedules = schedules.filter((s) => s.status !== 'cancelled' && s.date >= fmt(past) && s.date <= fmt(future))
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
    enrollments = await Promise.all(
      all.map(async (e) => {
        let courseName = ''
        try {
          const c = await getCourseById(e.courseId)
          if (c) courseName = c.name
        } catch {
          // 课程不存在则留空
        }
        return {
          courseId: e.courseId,
          courseName,
          status: e.status,
          purchasedHours: e.purchasedHours,
          giftHours: e.giftHours,
          remainingHours: (e.remainingPaidHours || 0) + (e.remainingGiftHours || 0),
          remainingPaidHours: e.remainingPaidHours,
          remainingGiftHours: e.remainingGiftHours,
          expiredAt: e.expiredAt || '',
        }
      }),
    )
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
