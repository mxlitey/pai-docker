import { getDb } from './core.js'
import { genFeedbackId } from '../id.js'

// ========== 课后反馈 feedback ==========
export async function getFeedback({ scheduleId, teacherId, studentId, courseId } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM feedback WHERE 1=1'
  const params = []
  if (scheduleId) { sql += ' AND schedule_id=?'; params.push(scheduleId) }
  if (teacherId) { sql += ' AND teacher_id=?'; params.push(teacherId) }
  if (studentId) { sql += ' AND student_id=?'; params.push(studentId) }
  if (courseId) { sql += ' AND course_id=?'; params.push(courseId) }
  sql += ' ORDER BY created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, scheduleId: r.schedule_id, courseId: r.course_id,
    teacherId: r.teacher_id, teacherName: r.teacher_name,
    studentId: r.student_id, studentName: r.student_name,
    date: r.date, content: r.content, rating: r.rating,
    createdAt: r.created_at,
  }))
}

export async function addFeedback(fb) {
  const db = getDb()
  const id = genFeedbackId()
  db.prepare(`INSERT INTO feedback
    (id, schedule_id, course_id, teacher_id, teacher_name, student_id, student_name, date, content, rating)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, fb.scheduleId || '', fb.courseId || '', fb.teacherId || '', fb.teacherName || '',
    fb.studentId || '', fb.studentName || '', fb.date || '', fb.content || '', Math.max(0, Math.min(5, Math.floor(Number(fb.rating) || 0))),
  )
  return { id, feedback: { ...fb, id } }
}

export async function updateFeedback(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM feedback WHERE id=?').get(id)
  if (!old) throw new Error('反馈记录不存在')
  const next = {
    content: patch.content !== undefined ? patch.content : old.content,
    rating: patch.rating !== undefined ? Math.max(0, Math.min(5, Math.floor(Number(patch.rating) || 0))) : old.rating,
  }
  db.prepare('UPDATE feedback SET content=?, rating=? WHERE id=?').run(next.content, next.rating, id)
  return { id }
}

export async function deleteFeedback(id) {
  const db = getDb()
  db.prepare('DELETE FROM feedback WHERE id=?').run(id)
  return { ok: true }
}
