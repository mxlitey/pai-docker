// 家长端专属链接 Token 签发 API
// POST /api/share-link-generate  body: { studentId }
// 鉴权：需 students:view 权限
// 返回：{ token, link } —— link 为可直接发给家长的完整 URL
//
// Token 设计：HMAC 签名 payload { sid, ps, ts }，ps 为学员手机号后4位
// 家长进入 H5 后需输入手机号后4位做二次校验，与 token 内 ps 比对
import { json, getStudentById } from '../_lib/store.js'
import { requirePermission, signParentToken, getTokenSecret } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 取手机号后4位数字（兼容含空格/横线的号码）
function phoneLast4(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  return digits.slice(-4)
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'students:view')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { studentId } = body
  if (!studentId) {
    return json({ code: 1, message: '缺少 studentId', data: null }, 400)
  }

  const student = await getStudentById(studentId)
  if (!student) {
    return json({ code: 1, message: '学员不存在', data: null }, 404)
  }

  const ps = phoneLast4(student.phone)
  if (!ps) {
    return json(
      { code: 1, message: '该学员未登记手机号，无法生成专属链接。请先在学员档案中填写家长手机号', data: null },
      400,
    )
  }

  const secret = getTokenSecret()
  const token = await signParentToken(secret, { sid: studentId, ps })

  await writeAudit(context, {
    action: 'create',
    module: 'shareLinks',
    targetType: 'student',
    targetId: studentId,
    targetName: student.name,
    summary: `生成家长专属链接 ${student.name}`,
  })

  return json({
    code: 0,
    message: 'ok',
    data: { token, studentId, studentName: student.name },
  })
}
