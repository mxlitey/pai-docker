import { getDb, validateStorageId } from './core.js'
import { genCourseId } from '../id.js'
import { now } from '../time.js'

// ========== 行 <-> 对象 映射 ==========
function rowToCourse(r) {
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    color: r.color || '',
    billingType: r.billing_type || 'per_lesson',
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
    color: course.color || '',
    billingType: course.billingType || 'per_lesson',
    term: course.term || '',
    status: course.status || 'active',
    category: course.category || '',
    grade: course.grade || '',
    description: course.description || '',
  }
  db.prepare(`INSERT INTO courses
    (id, name, color, billing_type, term, status, category, grade, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    finalCourse.id, finalCourse.name, finalCourse.color, finalCourse.billingType,
    finalCourse.term, finalCourse.status, finalCourse.category, finalCourse.grade, finalCourse.description, now(),
  )
  return { created: true, exists: false, course: finalCourse }
}

export async function updateCourse(course) {
  validateStorageId(course?.id, 'course.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(course.id)
  if (!old) return { updated: false, notFound: true }
  const before = rowToCourse(old)
  const nameChanged = old.name !== course.name
  const tx = db.transaction(() => {
    const info = db.prepare(`UPDATE courses SET
      name=?, color=?, billing_type=?, term=?, status=?, category=?, grade=?, description=?
      WHERE id=?`).run(
      course.name,
      course.color || '',
      course.billingType || 'per_lesson',
      course.term || '',
      course.status || 'active',
      course.category || '',
      course.grade || '',
      course.description || '',
      course.id,
    )
    // 课程改名：级联更新排课中的冗余 course_name，避免历史排课展示与报表分组陈旧
    if (nameChanged) {
      db.prepare('UPDATE schedules SET course_name=? WHERE course_id=?').run(course.name, course.id)
    }
    return info
  })
  const info = tx()
  const after = rowToCourse(db.prepare('SELECT * FROM courses WHERE id=?').get(course.id))
  return { updated: info.changes > 0, notFound: false, nameChanged, before, after, course: after }
}

export async function deleteCourseWithSchedules(courseId) {
  validateStorageId(courseId, 'courseId')
  const db = getDb()
  // 前置检查：有 active 报名或有班级引用时拒绝删除（保护财务数据完整性）
  const activeEnrollment = db.prepare(
    "SELECT 1 FROM enrollments WHERE course_id=? AND status='active' LIMIT 1"
  ).get(courseId)
  if (activeEnrollment) {
    return {
      courseRemoved: false,
      blocked: true,
      message: '该课程有进行中的报名记录，请先走退课流程后再删除课程',
    }
  }
  const referencingClass = db.prepare(
    'SELECT name FROM classes WHERE course_id=? LIMIT 1'
  ).get(courseId)
  if (referencingClass) {
    return {
      courseRemoved: false,
      blocked: true,
      message: `班级「${referencingClass.name}」仍关联该课程，请先删除或解绑班级后再删除课程`,
    }
  }
  const tx = db.transaction(() => {
    const oldRow = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId)
    const before = oldRow ? rowToCourse(oldRow) : null
    // 清理关联数据：排课、已结转/已过期的报名、反馈
    const del = db.prepare('DELETE FROM schedules WHERE course_id=?').run(courseId)
    db.prepare('DELETE FROM enrollments WHERE course_id=?').run(courseId)
    db.prepare('DELETE FROM feedback WHERE course_id=?').run(courseId)
    // schedule_changes 通过 original_schedule_id 关联排课，清理引用该课程排课的变更记录
    db.prepare(`DELETE FROM schedule_changes WHERE original_schedule_id IN
      (SELECT id FROM schedules WHERE course_id=?)`).run(courseId)
    db.prepare(`DELETE FROM schedule_changes WHERE new_schedule_id IN
      (SELECT id FROM schedules WHERE course_id=?)`).run(courseId)
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
