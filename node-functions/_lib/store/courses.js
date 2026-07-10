import { getDb, validateStorageId } from './core.js'
import { genCourseId } from '../id.js'
import { now } from '../time.js'

// ========== 行 <-> 对象 映射 ==========
function rowToCourse(r) {
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    teacher: r.teacher || '',
    location: r.location || '',
    color: r.color || '',
    defaultStartTime: r.default_start_time || '',
    defaultEndTime: r.default_end_time || '',
    unitPrice: typeof r.unit_price === 'number' ? r.unit_price : Number(r.unit_price || 0),
    billingType: r.billing_type || 'per_lesson',
    capacity: r.capacity ?? 0,
    term: r.term || '',
    status: r.status || 'active',
    category: r.category || '',
    grade: r.grade || '',
    description: r.description || '',
    createdAt: r.created_at || '',
  }
}

// ========== 课程 ==========
export async function getCourses() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM courses ORDER BY created_at, id').all()
  return rows.map(rowToCourse)
}

// 按 id 取单个课程（不存在返回 null）
export async function getCourseById(courseId) {
  if (!courseId) return null
  const db = getDb()
  const row = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId)
  return row ? rowToCourse(row) : null
}

export async function addCourse(course) {
  const db = getDb()
  const id = course?.id || genCourseId()
  validateStorageId(id, 'course.id')
  if (db.prepare('SELECT 1 FROM courses WHERE id = ?').get(id)) {
    return { created: false, exists: true }
  }
  const finalCourse = {
    id,
    name: course.name,
    teacher: course.teacher || '',
    location: course.location || '',
    color: course.color || '',
    defaultStartTime: course.defaultStartTime || '',
    defaultEndTime: course.defaultEndTime || '',
    unitPrice: Number(course.unitPrice || 0),
    billingType: course.billingType || 'per_lesson',
    capacity: Number(course.capacity || 0),
    term: course.term || '',
    status: course.status || 'active',
    category: course.category || '',
    grade: course.grade || '',
    description: course.description || '',
  }
  db.prepare(`INSERT INTO courses
    (id, name, teacher, location, color, default_start_time, default_end_time, unit_price, billing_type, capacity, term, status, category, grade, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    finalCourse.id, finalCourse.name, finalCourse.teacher, finalCourse.location, finalCourse.color,
    finalCourse.defaultStartTime, finalCourse.defaultEndTime, finalCourse.unitPrice, finalCourse.billingType,
    finalCourse.capacity, finalCourse.term, finalCourse.status, finalCourse.category, finalCourse.grade, finalCourse.description, now(),
  )
  return { created: true, exists: false, course: finalCourse }
}

export async function updateCourse(course) {
  validateStorageId(course?.id, 'course.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(course.id)
  if (!old) return { updated: false, notFound: true }
  const before = rowToCourse(old)
  const info = db.prepare(`UPDATE courses SET
    name=?, teacher=?, location=?, color=?, default_start_time=?, default_end_time=?,
    unit_price=?, billing_type=?, capacity=?, term=?, status=?, category=?, grade=?, description=?
    WHERE id=?`).run(
    course.name,
    course.teacher || '',
    course.location || '',
    course.color || '',
    course.defaultStartTime || '',
    course.defaultEndTime || '',
    Number(course.unitPrice || 0),
    course.billingType || 'per_lesson',
    Number(course.capacity || 0),
    course.term || '',
    course.status || 'active',
    course.category || '',
    course.grade || '',
    course.description || '',
    course.id,
  )
  const after = rowToCourse(db.prepare('SELECT * FROM courses WHERE id=?').get(course.id))
  return { updated: info.changes > 0, notFound: false, before, after, course: after }
}

export async function deleteCourseWithSchedules(courseId) {
  validateStorageId(courseId, 'courseId')
  const db = getDb()
  const tx = db.transaction(() => {
    const oldRow = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId)
    const before = oldRow ? rowToCourse(oldRow) : null
    const del = db.prepare('DELETE FROM schedules WHERE course_id=?').run(courseId)
    db.prepare('DELETE FROM enrollments WHERE course_id=?').run(courseId)
    const cou = db.prepare('DELETE FROM courses WHERE id=?').run(courseId)
    return {
      courseRemoved: cou.changes > 0,
      deletedScheduleCount: del.changes,
      deletedFiles: 0,
      before,
    }
  })
  return tx()
}
