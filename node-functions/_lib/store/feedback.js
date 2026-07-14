import { getDb } from './core.js'
import { genFeedbackId } from '../id.js'
import { now } from '../time.js'

// 解析 images 字段（JSON 数组 → 字符串数组；容错旧数据/非法 JSON）
function parseImages(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// ========== 课后反馈 feedback ==========
// 查询反馈列表，LEFT JOIN courses/schedules/classes 取课程名/班级名/年级供前端展示
export async function getFeedback({ scheduleId, teacherId, studentId, courseId } = {}) {
  const db = getDb()
  let sql = `SELECT f.*, c.name AS course_name, cl.name AS class_name,
    COALESCE(cl.grade, c.grade) AS grade
    FROM feedback f
    LEFT JOIN courses c ON c.id = f.course_id
    LEFT JOIN schedules s ON s.id = f.schedule_id
    LEFT JOIN classes cl ON cl.id = s.class_id
    WHERE 1=1`
  const params = []
  if (scheduleId) { sql += ' AND f.schedule_id=?'; params.push(scheduleId) }
  if (teacherId) { sql += ' AND f.teacher_id=?'; params.push(teacherId) }
  if (studentId) { sql += ' AND f.student_id=?'; params.push(studentId) }
  if (courseId) { sql += ' AND f.course_id=?'; params.push(courseId) }
  sql += ' ORDER BY f.created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, scheduleId: r.schedule_id, courseId: r.course_id,
    courseName: r.course_name || '',
    className: r.class_name || '',
    grade: r.grade || '',
    teacherId: r.teacher_id, teacherName: r.teacher_name,
    studentId: r.student_id, studentName: r.student_name,
    date: r.date, content: r.content, rating: r.rating,
    images: parseImages(r.images),
    createdAt: r.created_at,
  }))
}

// 检查某排课是否已有反馈（同一排课只允许一条反馈）
export async function hasFeedbackByScheduleId(scheduleId) {
  if (!scheduleId) return false
  const db = getDb()
  const row = db.prepare('SELECT 1 FROM feedback WHERE schedule_id=? LIMIT 1').get(scheduleId)
  return !!row
}

export async function addFeedback(fb) {
  const db = getDb()
  const id = genFeedbackId()
  const images = Array.isArray(fb.images) ? fb.images : []
  db.prepare(`INSERT INTO feedback
    (id, schedule_id, course_id, teacher_id, teacher_name, student_id, student_name, date, content, rating, images, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, fb.scheduleId || '', fb.courseId || '', fb.teacherId || '', fb.teacherName || '',
    fb.studentId || '', fb.studentName || '', fb.date || '', fb.content || '',
    Math.max(0, Math.min(5, Math.floor(Number(fb.rating) || 0))),
    JSON.stringify(images), now(),
  )
  return { id, feedback: { ...fb, id, images } }
}

export async function updateFeedback(id, patch, operator) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM feedback WHERE id=?').get(id)
  if (!old) throw new Error('反馈记录不存在')
  // 教师角色仅可修改自己的反馈；superadmin/admin 放行
  if (operator && operator.role === 'teacher' && old.teacher_id && old.teacher_id !== operator.id) {
    throw new Error('无权修改他人的反馈')
  }
  const next = {
    content: patch.content !== undefined ? patch.content : old.content,
    rating: patch.rating !== undefined ? Math.max(0, Math.min(5, Math.floor(Number(patch.rating) || 0))) : old.rating,
    images: patch.images !== undefined ? JSON.stringify(Array.isArray(patch.images) ? patch.images : []) : old.images,
  }
  db.prepare('UPDATE feedback SET content=?, rating=?, images=? WHERE id=?').run(next.content, next.rating, next.images, id)
  return { id }
}

export async function deleteFeedback(id, operator) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM feedback WHERE id=?').get(id)
  if (!old) return { ok: true, images: [] }
  // 教师角色仅可删除自己的反馈；superadmin/admin 放行
  if (operator && operator.role === 'teacher' && old.teacher_id && old.teacher_id !== operator.id) {
    throw new Error('无权删除他人的反馈')
  }
  db.prepare('DELETE FROM feedback WHERE id=?').run(id)
  // 返回 images 路径列表，供 API 层清理物理文件
  return { ok: true, images: parseImages(old.images) }
}

// 根据反馈 id 查询单条（上传图片时需要校验归属 + 取 studentId 拼目录）
export async function getFeedbackById(id) {
  const db = getDb()
  const r = db.prepare('SELECT * FROM feedback WHERE id=?').get(id)
  if (!r) return null
  return {
    id: r.id, scheduleId: r.schedule_id, courseId: r.course_id,
    teacherId: r.teacher_id, teacherName: r.teacher_name,
    studentId: r.student_id, studentName: r.student_name,
    date: r.date, content: r.content, rating: r.rating,
    images: parseImages(r.images),
    createdAt: r.created_at,
  }
}
