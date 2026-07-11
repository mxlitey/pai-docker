// 点名管理 API
// GET  /api/attendance?date=2026-07-15 -> 获取指定日期的所有排课（含 attended 状态），需鉴权
// POST /api/attendance                  -> 批量设置点名，需鉴权
import { searchSchedules, batchSetAttendance, getDb, json } from '../_lib/store.js'
import { requireAuth, requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 预检放行（同源部署，仅返回 204）
function corsOk() {
  return new Response(null, { status: 204 })
}

// 获取指定日期所有排课（按时间升序），供点名页加载
async function handleGet(context) {
  // requirePermission 已在 onRequest 中调用，此处复用其注入的 admin 主体
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const admin = context.admin
  const { request } = context
  const url = new URL(request.url)
  const date = url.searchParams.get('date') || ''
  if (!date || !DATE_RE.test(date)) {
    return json({ code: 1, message: 'date 参数必填，格式 yyyy-MM-dd', data: null }, 400)
  }
  try {
    const searchParams = { startDate: date, endDate: date }
    if (admin.role === 'teacher') {
      searchParams.teacher = admin.realName || admin.username
    }
    const schedules = (await searchSchedules(searchParams))
      .filter((s) => s.status !== 'cancelled')
    return json({ code: 0, message: 'ok', data: { schedules, total: schedules.length } })
  } catch (e) {
    console.error('[attendance] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}

// 批量设置点名
// body: { date: 'yyyy-MM-dd', items: [{ scheduleId, studentId, attended }] }
async function handlePost(context, request) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ code: 1, message: '请求体格式错误，需为 JSON', data: null }, 400)
  }
  const date = body?.date
  if (!date || !DATE_RE.test(date)) {
    return json({ code: 1, message: 'date 必填，格式 yyyy-MM-dd', data: null }, 400)
  }
  const items = Array.isArray(body?.items) ? body.items : []
  if (items.length === 0) {
    return json({ code: 0, message: '无更新项', data: { updatedSchedules: 0, updatedEnrollments: 0, errors: [] } })
  }
  if (items.length > 500) {
    return json({ code: 1, message: 'items 数量不能超过 500 条', data: null }, 400)
  }
  // 校验每项字段
  for (const it of items) {
    if (!it?.scheduleId || !it?.studentId || typeof it?.attended !== 'boolean') {
      return json({ code: 1, message: 'items 每项需含 scheduleId、studentId、attended(boolean)', data: null }, 400)
    }
  }
  // 统一补 date 字段，供 store 分组用
  const fullItems = items.map((it) => ({ ...it, date }))
  // 教师角色校验排课归属：只能对自己的排课点名
  const admin = context.admin
  if (admin && admin.role === 'teacher') {
    const teacherName = admin.realName || admin.username
    const placeholders = fullItems.map(() => '?').join(',')
    const db = getDb()
    const rows = db.prepare(`SELECT id, teacher FROM schedules WHERE id IN (${placeholders})`).all(...fullItems.map(i => i.scheduleId))
    const notOwned = rows.filter(r => r.teacher !== teacherName)
    if (notOwned.length > 0) {
      return json({ code: 1, message: '无权操作其他教师的排课', data: null }, 403)
    }
  }
  try {
    const result = await batchSetAttendance(fullItems)
    await writeAudit(context, {
      action: 'update',
      module: 'attendance',
      targetType: 'schedule',
      targetId: '',
      targetName: date,
      summary: `点名「${date}」：更新 ${result.updatedSchedules} 条排课` + (result.updatedEnrollments > 0 ? `、${result.updatedEnrollments} 条报名` : ''),
      after: {
        updatedSchedules: result.updatedSchedules,
        updatedEnrollments: result.updatedEnrollments,
      },
    })
    return json({ code: 0, message: '点名已保存', data: result })
  } catch (e) {
    console.error('[attendance] 保存异常:', e?.message || String(e))
    return json({ code: 1, message: '保存失败，请稍后重试', data: null }, 500)
  }
}

export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') return corsOk()
  if (request.method === 'GET') {
    const authFail = await requirePermission(context, 'attendance:view')
    if (authFail) return authFail
    return handleGet(context)
  }
  if (request.method === 'POST') {
    const authFail = await requirePermission(context, 'attendance:update')
    if (authFail) return authFail
    return handlePost(context, request)
  }
  return json({ code: 1, message: '不支持的请求方法，请使用 GET 或 POST', data: null }, 405)
}
