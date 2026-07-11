// 课后反馈 API
// GET    /api/feedback?scheduleId=&teacherId=&studentId=&courseId= -> 查询反馈列表，需 feedback:view
// POST   /api/feedback  body: fb                                     -> 新增反馈，需 feedback:create
// PUT    /api/feedback  body: { id, ...patch }                       -> 更新反馈(content/rating)，需 feedback:update
// DELETE /api/feedback?id=                                            -> 删除反馈，需 feedback:delete
import { getFeedback, addFeedback, updateFeedback, deleteFeedback, getScheduleById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 查询反馈列表
async function handleGet(context) {
  const { request } = context
  const url = new URL(request.url)
  const params = {
    scheduleId: url.searchParams.get('scheduleId') || undefined,
    teacherId: url.searchParams.get('teacherId') || undefined,
    studentId: url.searchParams.get('studentId') || undefined,
    courseId: url.searchParams.get('courseId') || undefined,
  }
  // 教师角色仅返回自己的反馈（按 teacher_id = 当前用户 id 过滤）
  if (context.admin.role === 'teacher') {
    params.teacherId = context.admin.id
  }
  try {
    const list = await getFeedback(params)
    return json({ code: 0, data: list })
  } catch (e) {
    console.error('[feedback] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}

// 新增反馈
async function handlePost(context) {
  const { request } = context
  const fb = await readBody(request)
  if (!fb || typeof fb !== 'object') {
    return json({ code: 1, message: '反馈数据不能为空', data: null }, 400)
  }

  // 强制以当前登录用户为反馈提交人
  fb.teacherId = context.admin.id
  fb.teacherName = context.admin.realName || context.admin.username

  // 字段校验
  if (!fb.content || typeof fb.content !== 'string' || !fb.content.trim()) {
    return json({ code: 1, message: '反馈内容不能为空', data: null }, 400)
  }
  if (fb.content.length > 2000) {
    return json({ code: 1, message: '反馈内容不能超过2000字', data: null }, 400)
  }

  try {
    // 校验排课归属并自动补全关联字段
    if (fb.scheduleId) {
      const schedule = await getScheduleById(fb.scheduleId)
      if (!schedule) {
        return json({ code: 1, message: '排课记录不存在', data: null }, 400)
      }
      if (context.admin.role === 'teacher') {
        const teacherName = context.admin.realName || context.admin.username
        if (schedule.teacher !== teacherName) {
          return json({ code: 1, message: '无权为其他教师的排课添加反馈', data: null }, 403)
        }
      }
      // 自动补全 studentId/studentName/courseId/date 从排课记录
      fb.studentId = fb.studentId || schedule.studentId
      fb.studentName = fb.studentName || schedule.studentName
      fb.courseId = fb.courseId || schedule.courseId
      fb.date = fb.date || schedule.date
    }

    const result = await addFeedback(fb)
    await writeAudit(context, {
      action: 'create',
      module: 'feedback',
      targetType: 'feedback',
      targetId: result.id,
      summary: `新增课后反馈 ${fb.studentName || ''} ${fb.date || ''}`.trim(),
      after: { ...fb, id: result.id },
    })
    return json({ code: 0, message: '反馈已提交', data: { id: result.id } })
  } catch (e) {
    console.error('[feedback] 新增异常:', e?.message || String(e))
    return json({ code: 1, message: '提交失败，请稍后重试', data: null }, 500)
  }
}

// 更新反馈（仅 content / rating）
async function handlePut(context) {
  const { request } = context
  const body = await readBody(request)
  const { id, ...patch } = body
  if (!id) {
    return json({ code: 1, message: '缺少 id', data: null }, 400)
  }

  try {
    await updateFeedback(id, patch, context.admin)
    await writeAudit(context, {
      action: 'update',
      module: 'feedback',
      targetType: 'feedback',
      targetId: id,
      summary: `更新课后反馈 ${id}`,
      after: patch,
    })
    return json({ code: 0, message: '反馈已更新', data: { id } })
  } catch (e) {
    if (e?.message === '反馈记录不存在') {
      return json({ code: 1, message: '反馈记录不存在', data: null }, 404)
    }
    if (e?.message === '无权修改他人的反馈') {
      return json({ code: 1, message: '无权修改他人的反馈', data: null }, 403)
    }
    console.error('[feedback] 更新异常:', e?.message || String(e))
    return json({ code: 1, message: '更新失败，请稍后重试', data: null }, 500)
  }
}

// 删除反馈
async function handleDelete(context) {
  const { request } = context
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return json({ code: 1, message: '缺少 id', data: null }, 400)
  }

  try {
    await deleteFeedback(id, context.admin)
    await writeAudit(context, {
      action: 'delete',
      module: 'feedback',
      targetType: 'feedback',
      targetId: id,
      summary: `删除课后反馈 ${id}`,
    })
    return json({ code: 0, message: '已删除', data: { ok: true } })
  } catch (e) {
    if (e?.message === '无权删除他人的反馈') {
      return json({ code: 1, message: '无权删除他人的反馈', data: null }, 403)
    }
    console.error('[feedback] 删除异常:', e?.message || String(e))
    return json({ code: 1, message: '删除失败，请稍后重试', data: null }, 500)
  }
}

export default async function onRequest(context) {
  const { request } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (request.method === 'GET') {
    const authFail = await requirePermission(context, 'feedback:view')
    if (authFail) return authFail
    return handleGet(context)
  }

  if (request.method === 'POST') {
    const authFail = await requirePermission(context, 'feedback:create')
    if (authFail) return authFail
    return handlePost(context)
  }

  if (request.method === 'PUT') {
    const authFail = await requirePermission(context, 'feedback:update')
    if (authFail) return authFail
    return handlePut(context)
  }

  if (request.method === 'DELETE') {
    const authFail = await requirePermission(context, 'feedback:delete')
    if (authFail) return authFail
    return handleDelete(context)
  }

  return json({ code: 1, message: '不支持的请求方法', data: null }, 405)
}
