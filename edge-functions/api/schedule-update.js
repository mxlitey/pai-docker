// 排课修改 API
// PUT /api/schedule  body: { old: Schedule, new: Schedule }
// 处理跨月/跨学员的存储路径迁移
import { updateSchedule, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验排课记录必填字段
function validateSchedule(s, prefix) {
  if (!s) throw new Error(`${prefix}: 数据不能为空`)
  if (!s.id) throw new Error(`${prefix}: 缺少 id`)
  if (!s.studentId) throw new Error(`${prefix}: 缺少 studentId`)
  if (!s.courseName) throw new Error(`${prefix}: 缺少 courseName`)
  if (!s.date) throw new Error(`${prefix}: 缺少 date`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
    throw new Error(`${prefix}: date 格式应为 yyyy-MM-dd`)
  }
}

export default async function onRequestPut(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { old: oldSchedule, new: newSchedule } = body

  if (!oldSchedule || !newSchedule) {
    return json(
      { code: 1, message: '请求体需包含 old 和 new 两个字段', data: null },
      400,
    )
  }

  try {
    validateSchedule(oldSchedule, 'old')
    validateSchedule(newSchedule, 'new')
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  if (oldSchedule.id !== newSchedule.id) {
    return json(
      { code: 1, message: '排课 id 不可修改', data: null },
      400,
    )
  }

  try {
    const result = await updateSchedule(oldSchedule, newSchedule)
    const message = result.moved
      ? `排课已迁移：${result.fromKey} → ${result.toKey}`
      : `排课已更新：${result.toKey}`
    return json({
      code: 0,
      message,
      data: { ...result, schedule: newSchedule },
    })
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 500)
  }
}
