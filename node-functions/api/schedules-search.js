// 排课搜索 API（跨学员）
// GET /api/schedules-search?startDate=2026-07-01&endDate=2026-07-31&courseId=c001
// 支持按日期范围 + 可选课程 ID 过滤；任一参数可单独使用，也可组合使用
// 全部参数缺省时返回全量排课（按日期+时间升序）
// 该接口为后台管理端使用，需登录鉴权
import { searchSchedules, json } from '../_lib/store.js'
import { requireAuth, requirePermission } from '../_lib/auth.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function onRequestGet(context) {
  const authFail = await requirePermission(context, 'schedules:view')
  if (authFail) return authFail
  const admin = context.admin
  const { request } = context
  const url = new URL(request.url)
  const startDate = url.searchParams.get('startDate') || ''
  const endDate = url.searchParams.get('endDate') || ''
  const courseId = url.searchParams.get('courseId') || ''
  const grade = url.searchParams.get('grade') || ''
  // 教师角色只能查看自己的排课
  const teacher = admin.role === 'teacher' ? (admin.realName || admin.username) : (url.searchParams.get('teacher') || '')
  const classId = url.searchParams.get('classId') || ''

  // 日期格式校验：传了就必须合法，避免脏输入触发异常分支
  if (startDate && !DATE_RE.test(startDate)) {
    return json(
      { code: 1, message: 'startDate 格式应为 yyyy-MM-dd', data: null },
      400,
    )
  }
  if (endDate && !DATE_RE.test(endDate)) {
    return json(
      { code: 1, message: 'endDate 格式应为 yyyy-MM-dd', data: null },
      400,
    )
  }
  if (startDate && endDate && startDate > endDate) {
    return json(
      { code: 1, message: 'startDate 不能晚于 endDate', data: null },
      400,
    )
  }

  try {
    const schedules = await searchSchedules({
      startDate,
      endDate,
      courseId,
      grade,
      teacher,
      classId,
    })
    return json({ code: 0, message: 'ok', data: { schedules, total: schedules.length } })
  } catch (e) {
    console.error('[schedules-search] 查询异常:', e?.message || String(e))
    return json(
      { code: 1, message: '查询失败，请稍后重试', data: null },
      500,
    )
  }
}
