// 文件上传 API（用于课后反馈图片）
// POST /api/upload  multipart/form-data: field "file" + field "feedbackId"
// 需 feedback:create 或 feedback:update 权限
// 存储路径：uploads/feedback/{studentId}/{feedbackId}/{timestamp}-{seq}.{ext}
// 返回 { url: "/uploads/feedback/..." }
import { getFeedbackById, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const UPLOADS_ROOT = join(ROOT_DIR, 'uploads')

// 允许的图片扩展名（白名单，防上传 HTML/JS 等可执行文件）
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
// 单文件大小上限：5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024

export default async function onRequestPost(context) {
  // 反馈图片上传归入 feedback:create 权限（教师创建/编辑反馈时上传）
  const authFail = await requirePermission(context, 'feedback:create')
  if (authFail) return authFail
  const { request } = context

  // 必须是 multipart/form-data
  const ct = request.headers.get('content-type') || ''
  if (!ct.includes('multipart/form-data')) {
    return json({ code: 1, message: '必须使用 multipart/form-data 上传', data: null }, 400)
  }

  let formData
  try {
    formData = await request.formData()
  } catch (e) {
    console.error('[upload] formData 解析失败:', e?.message || String(e))
    return json({ code: 1, message: '上传数据解析失败', data: null }, 400)
  }

  const feedbackId = formData.get('feedbackId')
  const file = formData.get('file')

  if (!feedbackId) {
    return json({ code: 1, message: '缺少 feedbackId', data: null }, 400)
  }
  if (!file || typeof file === 'string') {
    return json({ code: 1, message: '缺少 file 字段或文件无效', data: null }, 400)
  }

  // 校验文件大小
  const fileSize = file.size
  if (fileSize <= 0) {
    return json({ code: 1, message: '文件为空', data: null }, 400)
  }
  if (fileSize > MAX_FILE_SIZE) {
    return json({ code: 1, message: `文件过大，单个图片不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`, data: null }, 400)
  }

  // 校验扩展名（白名单）
  const originalName = file.name || ''
  const ext = extname(originalName).toLowerCase()
  if (!ext) {
    return json({ code: 1, message: '文件缺少扩展名', data: null }, 400)
  }
  if (!ALLOWED_EXT.includes(ext)) {
    return json({ code: 1, message: `不支持的图片格式，仅支持 ${ALLOWED_EXT.join(', ')}`, data: null }, 400)
  }

  try {
    // 校验 feedbackId 归属：必须存在且属于当前用户（教师只能给自己创建的反馈传图）
    const fb = await getFeedbackById(feedbackId)
    if (!fb) {
      return json({ code: 1, message: '反馈记录不存在', data: null }, 404)
    }
    if (context.admin.role === 'teacher' && fb.teacherId !== context.admin.id) {
      return json({ code: 1, message: '无权为其他教师的反馈上传图片', data: null }, 403)
    }
    if (!fb.studentId) {
      return json({ code: 1, message: '反馈未关联学员，无法确定存储目录', data: null }, 400)
    }

    // 拼存储路径：uploads/feedback/{studentId}/{feedbackId}/{timestamp}-{random}{ext}
    // 用 studentId 一级目录按学员分门别类，feedbackId 二级目录便于整条删除时清理
    // 文件名用时间戳+随机串防冲突
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const fileName = `${ts}-${rand}${ext}`
    const dir = join(UPLOADS_ROOT, 'feedback', fb.studentId, feedbackId)
    await mkdir(dir, { recursive: true })
    const fsPath = join(dir, fileName)

    // 写入文件
    const arrayBuffer = await file.arrayBuffer()
    await writeFile(fsPath, Buffer.from(arrayBuffer))

    // 返回可访问的 URL 路径（相对站点根）
    const url = `/uploads/feedback/${fb.studentId}/${feedbackId}/${fileName}`

    await writeAudit(context, {
      action: 'create',
      module: 'feedback',
      targetType: 'feedback_image',
      targetId: feedbackId,
      summary: `上传反馈图片 ${url} (${fileSize} bytes)`,
      after: { url, feedbackId, size: fileSize },
    })

    return json({ code: 0, message: '上传成功', data: { url } })
  } catch (e) {
    console.error('[upload] 上传异常:', e?.message || String(e))
    return json({ code: 1, message: '上传失败，请稍后重试', data: null }, 500)
  }
}
