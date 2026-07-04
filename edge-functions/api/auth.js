// 登录验证 API
// POST /api/auth  body: { password: string }
// 验证通过返回 token，后续管理请求需携带 Authorization: Bearer <token>
import { signToken } from '../_lib/auth.js'
import { json } from '../_lib/store.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  const { request, env } = context
  const password = env?.ADMIN_PASSWORD

  if (!password) {
    return json(
      { code: 1, message: '服务端未配置管理密码（ADMIN_PASSWORD 环境变量）', data: null },
      500,
    )
  }

  const body = await readBody(request)
  const { password: input } = body

  if (!input) {
    return json({ code: 1, message: '请输入密码', data: null }, 400)
  }

  if (input !== password) {
    return json({ code: 1, message: '密码错误', data: null }, 401)
  }

  const token = await signToken(password)
  return json({
    code: 0,
    message: '登录成功',
    data: { token },
  })
}
