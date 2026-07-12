import { getDb, validateStorageId } from './core.js'
import { genClassId } from '../id.js'
import { now } from '../time.js'

// ========== 班级管理 ==========
// 班级 = 人的集合 + 关联课程 + 教师 + 默认时间地点。
// 排课以班级为单位：选班级后自动带出班级成员名单，批量生成 schedule（每学员一条，带 class_id）。
// class_members 为 class_id × student_id 关联表（复合主键）。
function rowToClass(r, memberCount) {
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    courseId: r.course_id || '',
    grade: r.grade || '',
    teacher: r.teacher || '',
    location: r.location || '',
    color: r.color || '',
    defaultStartTime: r.default_start_time || '',
    defaultEndTime: r.default_end_time || '',
    capacity: r.capacity ?? 0,
    status: r.status || 'active',
    remark: r.remark || '',
    createdAt: r.created_at || '',
    memberCount: typeof memberCount === 'number' ? memberCount : 0,
  }
}

// 班级列表（带成员数 + 关联课程名）
export async function getClasses({ courseId, status } = {}) {
  const db = getDb()
  let sql = `SELECT c.*, co.name AS course_name,
      (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = c.id) AS member_count
    FROM classes c
    LEFT JOIN courses co ON co.id = c.course_id
    WHERE 1=1`
  const params = []
  if (courseId) { sql += ' AND c.course_id=?'; params.push(courseId) }
  if (status) { sql += ' AND c.status=?'; params.push(status) }
  sql += ' ORDER BY c.name, datetime(c.created_at), c.id'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    courseId: r.course_id || '',
    grade: r.grade || '',
    courseName: r.course_name || '',
    teacher: r.teacher || '',
    location: r.location || '',
    color: r.color || '',
    defaultStartTime: r.default_start_time || '',
    defaultEndTime: r.default_end_time || '',
    capacity: r.capacity ?? 0,
    status: r.status || 'active',
    remark: r.remark || '',
    createdAt: r.created_at || '',
    memberCount: r.member_count || 0,
  }))
}

export async function getClassById(classId) {
  if (!classId) return null
  const db = getDb()
  const row = db.prepare('SELECT * FROM classes WHERE id=?').get(classId)
  if (!row) return null
  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM class_members WHERE class_id=?').get(classId).c
  return rowToClass(row, memberCount)
}

export async function addClass(cls) {
  const db = getDb()
  const id = cls?.id || genClassId()
  validateStorageId(id, 'class.id')
  if (db.prepare('SELECT 1 FROM classes WHERE id=?').get(id)) {
    return { created: false, exists: true }
  }
  const name = (cls.name || '').trim()
  if (!name) throw new Error('班级名称不能为空')
  const finalClass = {
    id,
    name,
    courseId: cls.courseId || '',
    grade: cls.grade || '',
    teacher: cls.teacher || '',
    location: cls.location || '',
    color: cls.color || '',
    defaultStartTime: cls.defaultStartTime || '',
    defaultEndTime: cls.defaultEndTime || '',
    capacity: Number(cls.capacity || 0),
    status: cls.status || 'active',
    remark: cls.remark || '',
  }
  db.prepare(`INSERT INTO classes
    (id, name, course_id, grade, teacher, location, color, default_start_time, default_end_time, capacity, status, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    finalClass.id, finalClass.name, finalClass.courseId, finalClass.grade, finalClass.teacher,
    finalClass.location, finalClass.color, finalClass.defaultStartTime, finalClass.defaultEndTime,
    finalClass.capacity, finalClass.status, finalClass.remark, now(),
  )
  return { created: true, exists: false, class: { ...finalClass, memberCount: 0, createdAt: now() } }
}

export async function updateClass(cls) {
  validateStorageId(cls?.id, 'class.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM classes WHERE id=?').get(cls.id)
  if (!old) return { updated: false, notFound: true }
  const before = rowToClass(old, db.prepare('SELECT COUNT(*) AS c FROM class_members WHERE class_id=?').get(cls.id).c)
  const name = (cls.name ?? old.name).trim()
  if (!name) throw new Error('班级名称不能为空')
  const tx = db.transaction(() => {
    db.prepare(`UPDATE classes SET
      name=?, course_id=?, grade=?, teacher=?, location=?, color=?, default_start_time=?, default_end_time=?, capacity=?, status=?, remark=?
      WHERE id=?`).run(
      name,
      cls.courseId ?? old.course_id,
      cls.grade ?? old.grade,
      cls.teacher ?? old.teacher,
      cls.location ?? old.location,
      cls.color ?? old.color,
      cls.defaultStartTime ?? old.default_start_time,
      cls.defaultEndTime ?? old.default_end_time,
      Number(cls.capacity ?? old.capacity),
      cls.status ?? old.status,
      cls.remark ?? old.remark,
      cls.id,
    )
    // 班级改名：级联更新 schedules.class_id 无需（id 不变）。教师/地点变化不回写已生成排课。
    return null
  })
  tx()
  const after = await getClassById(cls.id)
  return { updated: true, notFound: false, before, after, class: after }
}

export async function deleteClass(classId) {
  validateStorageId(classId, 'class.id')
  const db = getDb()
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(classId)
  if (!cls) return { deleted: false, notFound: true }
  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM class_members WHERE class_id=?').get(classId).c
  const before = rowToClass(cls, memberCount)
  // 删除前提：班级内没有成员
  if (memberCount > 0) {
    return { deleted: false, blocked: true, memberCount, message: `班级内仍有 ${memberCount} 名成员，请先移除全部成员后再删除` }
  }
  // 引用检查：仍有排课引用该班级则拒绝删除
  const scheduleCount = db.prepare("SELECT COUNT(*) AS c FROM schedules WHERE class_id=?").get(classId).c
  if (scheduleCount > 0) {
    return { deleted: false, inUse: true, scheduleCount }
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM class_members WHERE class_id=?').run(classId)
    db.prepare('DELETE FROM classes WHERE id=?').run(classId)
  })
  tx()
  return { deleted: true, notFound: false, before }
}

// ========== 班级成员管理 ==========
// 查询班级成员（join students 取档案信息）
export async function getClassMembers(classId) {
  validateStorageId(classId, 'classId')
  const db = getDb()
  const rows = db.prepare(`SELECT s.id, s.name, s.grade, s.phone, s.status, cm.created_at AS joined_at
    FROM class_members cm
    JOIN students s ON s.id = cm.student_id
    WHERE cm.class_id=?
    ORDER BY s.name, s.id`).all(classId)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    grade: r.grade || '',
    phone: r.phone || '',
    status: r.status || 'active',
    joinedAt: r.joined_at || '',
  }))
}

// 批量加成员（忽略已存在的）
export async function addClassMembers(classId, studentIds) {
  validateStorageId(classId, 'classId')
  const db = getDb()
  if (!db.prepare('SELECT 1 FROM classes WHERE id=?').get(classId)) {
    return { added: 0, notFound: 'class' }
  }
  let added = 0
  const tx = db.transaction(() => {
    const stmt = db.prepare('INSERT OR IGNORE INTO class_members (class_id, student_id, created_at) VALUES (?, ?, ?)')
    for (const sid of studentIds) {
      if (!sid) continue
      if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(sid)) continue
      const info = stmt.run(classId, sid, now())
      if (info.changes > 0) added++
    }
  })
  tx()
  return { added }
}

// 批量移除成员
export async function removeClassMembers(classId, studentIds) {
  validateStorageId(classId, 'classId')
  const db = getDb()
  let removed = 0
  let deletedSchedules = 0
  const tx = db.transaction(() => {
    const stmt = db.prepare('DELETE FROM class_members WHERE class_id=? AND student_id=?')
    // 同步删除该班级下这些学员的未点名排课（保留已点名排课用于报表）
    const delSchedStmt = db.prepare(
      `DELETE FROM schedules WHERE class_id=? AND student_id=? AND attended IS NULL`
    )
    for (const sid of studentIds) {
      if (!sid) continue
      const info = stmt.run(classId, sid)
      if (info.changes > 0) {
        removed++
        deletedSchedules += delSchedStmt.run(classId, sid).changes
      }
    }
  })
  tx()
  return { removed, deletedSchedules }
}
