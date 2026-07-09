// SQLite 存储层
// 数据组织：
//   students    表 -> 学员
//   courses     表 -> 课程
//   schedules   表 -> 排课（按 student_id + date 索引查询）
//   announcement 表 -> 公告（单行）
//   admin       表 -> 超管账号（为后期多账号体系预留）
// 注：项目名称、token 签名密钥等高频读取的系统配置存于 config.json，不占 DB
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { genScheduleId } from './id.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 数据目录：优先环境变量，否则项目根 data/
const DATA_DIR = process.env.DATA_DIR
  || join(__dirname, '..', '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = join(DATA_DIR, 'pai.db')

// 单例连接
let dbInstance = null
export function getDb() {
  if (dbInstance) return dbInstance
  const db = new Database(DB_PATH)
  // WAL 模式：读不阻塞写，并发友好
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // 建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      grade           TEXT DEFAULT '',
      hours           INTEGER,
      remaining_hours INTEGER,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      teacher            TEXT DEFAULT '',
      location           TEXT DEFAULT '',
      color              TEXT DEFAULT '',
      default_start_time TEXT DEFAULT '',
      default_end_time   TEXT DEFAULT '',
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id           TEXT PRIMARY KEY,
      student_id   TEXT NOT NULL,
      student_name TEXT NOT NULL,
      course_id    TEXT DEFAULT '',
      course_name  TEXT NOT NULL,
      teacher      TEXT DEFAULT '',
      location     TEXT DEFAULT '',
      date         TEXT NOT NULL,
      start_time   TEXT DEFAULT '',
      end_time     TEXT DEFAULT '',
      note         TEXT DEFAULT '',
      color        TEXT DEFAULT '',
      attended     INTEGER,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_schedules_student_date ON schedules(student_id, date);
    CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
    CREATE INDEX IF NOT EXISTS idx_schedules_student ON schedules(student_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_course ON schedules(course_id);

    CREATE TABLE IF NOT EXISTS announcement (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      content    TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
    INSERT OR IGNORE INTO announcement (id, content, updated_at) VALUES (1, '', '');

    CREATE TABLE IF NOT EXISTS admin (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      role            TEXT NOT NULL DEFAULT 'superadmin',
      created_at      TEXT DEFAULT (datetime('now'))
    );
  `)
  dbInstance = db
  return db
}

// ========== 输入校验（防 SQL 注入与路径遍历） ==========
function validateStorageId(id, name = 'id') {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error(`${name} 含非法字符（仅允许字母、数字、下划线、短横线，长度 1-64）`)
  }
}
function validateMonth(month, name = 'month') {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`${name} 格式应为 yyyy-MM`)
  }
}
function validateDate(date, name = 'date') {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${name} 格式应为 yyyy-MM-dd`)
  }
}

// ========== 行 <-> 对象 映射 ==========
function rowToStudent(r) {
  if (!r) return null
  const s = { id: r.id, name: r.name, grade: r.grade || '' }
  if (r.hours !== null && r.hours !== undefined) s.hours = r.hours
  if (r.remaining_hours !== null && r.remaining_hours !== undefined) s.remainingHours = r.remaining_hours
  return s
}
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
  }
}
function rowToSchedule(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    courseId: r.course_id || '',
    courseName: r.course_name,
    teacher: r.teacher || '',
    location: r.location || '',
    date: r.date,
    startTime: r.start_time || '',
    endTime: r.end_time || '',
    note: r.note || '',
    color: r.color || '',
    attended: r.attended === null ? undefined : !!r.attended,
  }
}

// ========== 学员 ==========
export async function getStudents() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM students ORDER BY created_at, id').all()
  return rows.map(rowToStudent)
}

export async function saveStudents(students) {
  // 兼容旧接口：整体覆盖（事务内先清后插）
  const db = getDb()
  const tx = db.transaction((list) => {
    db.prepare('DELETE FROM students').run()
    const stmt = db.prepare(`INSERT INTO students (id, name, grade, hours, remaining_hours)
      VALUES (@id, @name, @grade, @hours, @remaining_hours)`)
    for (const s of list) {
      stmt.run({
        id: s.id,
        name: s.name,
        grade: s.grade || '',
        hours: s.hours ?? null,
        remaining_hours: s.remainingHours ?? null,
      })
    }
  })
  tx(students)
}

export async function addStudent(student) {
  validateStorageId(student?.id, 'student.id')
  const db = getDb()
  const exists = db.prepare('SELECT 1 FROM students WHERE id = ?').get(student.id)
  if (exists) return { created: false, exists: true }
  db.prepare(`INSERT INTO students (id, name, grade, hours, remaining_hours)
    VALUES (?, ?, ?, ?, ?)`).run(
    student.id,
    student.name,
    student.grade || '',
    student.hours ?? null,
    student.remainingHours ?? null,
  )
  return { created: true, exists: false }
}

export async function updateStudent(student) {
  validateStorageId(student?.id, 'student.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM students WHERE id = ?').get(student.id)
  if (!old) return { updated: false, notFound: true, nameChanged: false, updatedScheduleFiles: 0 }
  const nameChanged = old.name !== student.name
  // 更新学员
  db.prepare(`UPDATE students SET name=?, grade=?, hours=?, remaining_hours=? WHERE id=?`).run(
    student.name,
    student.grade || '',
    student.hours ?? null,
    student.remainingHours ?? null,
    student.id,
  )
  // 姓名变更：级联更新排课中的 student_name
  let updatedScheduleFiles = 0
  if (nameChanged) {
    const info = db.prepare('UPDATE schedules SET student_name=? WHERE student_id=?').run(student.name, student.id)
    updatedScheduleFiles = info.changes > 0 ? 1 : 0
  }
  return { updated: true, notFound: false, nameChanged, updatedScheduleFiles }
}

export async function deleteStudentWithSchedules(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const tx = db.transaction(() => {
    const del = db.prepare('DELETE FROM schedules WHERE student_id=?').run(studentId)
    const stu = db.prepare('DELETE FROM students WHERE id=?').run(studentId)
    return { deletedScheduleFiles: del.changes > 0 ? 1 : 0, studentRemoved: stu.changes > 0 }
  })
  return tx()
}

// ========== 课程 ==========
export async function getCourses() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM courses ORDER BY created_at, id').all()
  return rows.map(rowToCourse)
}

export async function saveCourses(courses) {
  const db = getDb()
  const tx = db.transaction((list) => {
    db.prepare('DELETE FROM courses').run()
    const stmt = db.prepare(`INSERT INTO courses (id, name, teacher, location, color, default_start_time, default_end_time)
      VALUES (@id, @name, @teacher, @location, @color, @default_start_time, @default_end_time)`)
    for (const c of list) {
      stmt.run({
        id: c.id,
        name: c.name,
        teacher: c.teacher || '',
        location: c.location || '',
        color: c.color || '',
        default_start_time: c.defaultStartTime || '',
        default_end_time: c.defaultEndTime || '',
      })
    }
  })
  tx(courses)
}

export async function addCourse(course) {
  const db = getDb()
  const exists = db.prepare('SELECT 1 FROM courses WHERE id = ?').get(course.id)
  if (exists) return { created: false, exists: true }
  db.prepare(`INSERT INTO courses (id, name, teacher, location, color, default_start_time, default_end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    course.id,
    course.name,
    course.teacher || '',
    course.location || '',
    course.color || '',
    course.defaultStartTime || '',
    course.defaultEndTime || '',
  )
  return { created: true, exists: false }
}

export async function updateCourse(course) {
  const db = getDb()
  const info = db.prepare(`UPDATE courses SET name=?, teacher=?, location=?, color=?, default_start_time=?, default_end_time=?
    WHERE id=?`).run(
    course.name,
    course.teacher || '',
    course.location || '',
    course.color || '',
    course.defaultStartTime || '',
    course.defaultEndTime || '',
    course.id,
  )
  return { updated: info.changes > 0, notFound: info.changes === 0 }
}

export async function deleteCourseWithSchedules(courseId) {
  validateStorageId(courseId, 'courseId')
  const db = getDb()
  const tx = db.transaction(() => {
    const del = db.prepare('DELETE FROM schedules WHERE course_id=?').run(courseId)
    const cou = db.prepare('DELETE FROM courses WHERE id=?').run(courseId)
    return {
      courseRemoved: cou.changes > 0,
      deletedScheduleCount: del.changes,
      deletedFiles: 0,
    }
  })
  return tx()
}

// ========== 排课 ==========
export async function getSchedulesByMonth(studentId, month) {
  validateStorageId(studentId, 'studentId')
  validateMonth(month, 'month')
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM schedules
    WHERE student_id=? AND substr(date,1,7)=?
    ORDER BY date, start_time`).all(studentId, month)
  return rows.map(rowToSchedule)
}

export async function saveSchedulesByMonth(studentId, month, schedules) {
  validateStorageId(studentId, 'studentId')
  validateMonth(month, 'month')
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM schedules WHERE student_id=? AND substr(date,1,7)=?').run(studentId, month)
    const stmt = db.prepare(`INSERT INTO schedules
      (id, student_id, student_name, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended)
      VALUES (@id, @student_id, @student_name, @course_id, @course_name, @teacher, @location, @date, @start_time, @end_time, @note, @color, @attended)`)
    for (const s of schedules) {
      stmt.run({
        id: s.id,
        student_id: s.studentId,
        student_name: s.studentName,
        course_id: s.courseId || '',
        course_name: s.courseName,
        teacher: s.teacher || '',
        location: s.location || '',
        date: s.date,
        start_time: s.startTime || '',
        end_time: s.endTime || '',
        note: s.note || '',
        color: s.color || '',
        attended: s.attended === undefined ? null : (s.attended ? 1 : 0),
      })
    }
  })
  tx()
}

export async function listScheduleMonths(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const rows = db.prepare(`SELECT DISTINCT substr(date,1,7) AS m
    FROM schedules WHERE student_id=? ORDER BY m`).all(studentId)
  return rows.map((r) => r.m)
}

export async function getAllSchedulesByStudent(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM schedules WHERE student_id=?
    ORDER BY date, start_time`).all(studentId)
  return rows.map(rowToSchedule)
}

export async function getSchedulesByDateRange(studentId, startDate, endDate) {
  validateStorageId(studentId, 'studentId')
  validateDate(startDate, 'startDate')
  validateDate(endDate, 'endDate')
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM schedules WHERE student_id=? AND date>=? AND date<=?
    ORDER BY date, start_time`).all(studentId, startDate, endDate)
  return rows.map(rowToSchedule)
}

export async function searchSchedules({ startDate, endDate, courseId } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM schedules WHERE 1=1'
  const params = []
  if (startDate) { sql += ' AND date>=?'; params.push(startDate) }
  if (endDate) { sql += ' AND date<=?'; params.push(endDate) }
  if (courseId) { sql += ' AND course_id=?'; params.push(courseId) }
  sql += ' ORDER BY date, start_time'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToSchedule)
}

export async function batchAddSchedules(schedules) {
  for (const s of schedules) {
    validateStorageId(s.studentId, 'studentId')
    validateDate(s.date, 'date')
  }
  const db = getDb()
  let created = 0
  let skipped = 0
  const errors = []
  const usedIds = new Set()

  const tx = db.transaction(() => {
    for (const s of schedules) {
      let id = s.id
      const existRow = db.prepare('SELECT 1 FROM schedules WHERE id=?').get(id)
      let guard = 0
      while ((existRow || usedIds.has(id)) && guard < 100) {
        id = genScheduleId()
        guard++
      }
      // 重新检查新 id
      if (db.prepare('SELECT 1 FROM schedules WHERE id=?').get(id) || usedIds.has(id)) {
        errors.push({ studentId: s.studentId, date: s.date, reason: 'id 碰撞重试耗尽' })
        skipped++
        continue
      }
      db.prepare(`INSERT INTO schedules
        (id, student_id, student_name, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id,
        s.studentId,
        s.studentName,
        s.courseId || '',
        s.courseName,
        s.teacher || '',
        s.location || '',
        s.date,
        s.startTime || '',
        s.endTime || '',
        s.note || '',
        s.color || '',
        s.attended === undefined ? null : (s.attended ? 1 : 0),
      )
      usedIds.add(id)
      created++
    }
  })
  tx()
  return { created, skipped, errors }
}

export async function addSchedule(schedule) {
  const studentId = schedule.studentId
  const month = schedule.date.slice(0, 7)
  const key = `schedules/${studentId}/${month}.json`
  validateStorageId(studentId, 'studentId')
  validateDate(schedule.date, 'date')

  const db = getDb()
  if (db.prepare('SELECT 1 FROM schedules WHERE id=?').get(schedule.id)) {
    return { created: false, key, exists: true }
  }
  db.prepare(`INSERT INTO schedules
    (id, student_id, student_name, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    schedule.id,
    studentId,
    schedule.studentName,
    schedule.courseId || '',
    schedule.courseName,
    schedule.teacher || '',
    schedule.location || '',
    schedule.date,
    schedule.startTime || '',
    schedule.endTime || '',
    schedule.note || '',
    schedule.color || '',
    schedule.attended === undefined ? null : (schedule.attended ? 1 : 0),
  )
  return { created: true, key, exists: false }
}

export async function updateSchedule(oldSchedule, newSchedule) {
  if (oldSchedule.id !== newSchedule.id) {
    throw new Error('排课 id 不可修改')
  }
  validateStorageId(oldSchedule.studentId, 'oldSchedule.studentId')
  validateDate(oldSchedule.date, 'oldSchedule.date')
  validateStorageId(newSchedule.studentId, 'newSchedule.studentId')
  validateDate(newSchedule.date, 'newSchedule.date')

  const db = getDb()
  const tx = db.transaction(() => {
    const exist = db.prepare('SELECT * FROM schedules WHERE id=?').get(newSchedule.id)
    if (!exist) throw new Error('未找到原排课记录')
    db.prepare(`UPDATE schedules SET
      student_id=?, student_name=?, course_id=?, course_name=?, teacher=?, location=?, date=?, start_time=?, end_time=?, note=?, color=?
      WHERE id=?`).run(
      newSchedule.studentId,
      newSchedule.studentName,
      newSchedule.courseId || '',
      newSchedule.courseName,
      newSchedule.teacher || '',
      newSchedule.location || '',
      newSchedule.date,
      newSchedule.startTime || '',
      newSchedule.endTime || '',
      newSchedule.note || '',
      newSchedule.color || '',
      newSchedule.id,
    )
    return { moved: true }
  })
  const r = tx()
  return { ...r, fromKey: '', toKey: '' }
}

export async function deleteSchedule(scheduleId, studentId, date) {
  validateStorageId(studentId, 'studentId')
  validateDate(date, 'date')
  const db = getDb()
  const info = db.prepare('DELETE FROM schedules WHERE id=? AND student_id=?').run(scheduleId, studentId)
  return { deleted: info.changes > 0, count: info.changes }
}

// ========== 点名 ==========
export async function batchSetAttendance(items) {
  for (const item of items) {
    validateStorageId(item.studentId, 'studentId')
    validateDate(String(item.date), 'date')
  }
  const db = getDb()
  const errors = []
  let updatedSchedules = 0
  const studentDeltaMap = new Map()

  const tx = db.transaction(() => {
    for (const item of items) {
      const row = db.prepare('SELECT * FROM schedules WHERE id=? AND student_id=?').get(item.scheduleId, item.studentId)
      if (!row) {
        errors.push(`排课 ${item.scheduleId} 在 ${item.studentId} 中未找到`)
        continue
      }
      const oldAttended = row.attended === null ? undefined : !!row.attended
      const newAttended = !!item.attended
      if (oldAttended === newAttended) continue
      db.prepare('UPDATE schedules SET attended=? WHERE id=?').run(newAttended ? 1 : 0, item.scheduleId)
      updatedSchedules++
      const delta = newAttended ? -1 : 1
      studentDeltaMap.set(item.studentId, (studentDeltaMap.get(item.studentId) || 0) + delta)
    }
    let updatedStudents = 0
    for (const [studentId, delta] of studentDeltaMap) {
      const row = db.prepare('SELECT * FROM students WHERE id=?').get(studentId)
      if (!row) {
        errors.push(`学员 ${studentId} 未找到，无法更新课时`)
        continue
      }
      const cur = typeof row.remaining_hours === 'number' ? row.remaining_hours : 0
      db.prepare('UPDATE students SET remaining_hours=? WHERE id=?').run(cur + delta, studentId)
      updatedStudents++
    }
    return { updatedSchedules, updatedStudents }
  })
  const r = tx()
  return { ...r, errors }
}

// ========== 公告 ==========
export async function getAnnouncement() {
  const db = getDb()
  const row = db.prepare('SELECT * FROM announcement WHERE id=1').get()
  if (!row) return { content: '', updatedAt: '' }
  return { content: row.content || '', updatedAt: row.updated_at || '' }
}

export async function saveAnnouncement(content) {
  const db = getDb()
  const payload = {
    content: String(content || ''),
    updatedAt: new Date().toISOString(),
  }
  db.prepare('UPDATE announcement SET content=?, updated_at=? WHERE id=1').run(payload.content, payload.updatedAt)
  return payload
}

// ========== 超管账号（为后期多账号体系预留） ==========
// 当前阶段：单超管，由首次启动引导页创建
export async function getSuperAdmin() {
  const db = getDb()
  const row = db.prepare("SELECT * FROM admin WHERE role='superadmin' LIMIT 1").get()
  return row || null
}

export async function countAdmins() {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS c FROM admin').get()
  return row?.c || 0
}

export async function createSuperAdmin(username, passwordHash) {
  const db = getDb()
  db.prepare("INSERT INTO admin (username, password_hash, role) VALUES (?, ?, 'superadmin')").run(username, passwordHash)
}

export async function getAdminByUsername(username) {
  const db = getDb()
  return db.prepare('SELECT * FROM admin WHERE username=?').get(username) || null
}

// ========== JSON 响应工具 ==========
// 同源部署，无需 CORS 头；保留 Content-Type 即可
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
