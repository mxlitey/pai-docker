import { getDb, validateStorageId, validateMonth, validateDate } from './core.js'
import { genScheduleId } from '../id.js'
import { now } from '../time.js'

// ========== 行 <-> 对象 映射 ==========
function rowToSchedule(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    classId: r.class_id || '',
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
    status: r.status || 'scheduled',
    room: r.room || '',
    makeupFor: r.makeup_for || '',
    rescheduledFrom: r.rescheduled_from || '',
  }
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
      (id, student_id, student_name, class_id, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended, status, room, makeup_for, rescheduled_from, created_at)
      VALUES (@id, @student_id, @student_name, @class_id, @course_id, @course_name, @teacher, @location, @date, @start_time, @end_time, @note, @color, @attended, @status, @room, @makeup_for, @rescheduled_from, @created_at)`)
    for (const s of schedules) {
      stmt.run({
        id: s.id,
        student_id: s.studentId,
        student_name: s.studentName,
        class_id: s.classId || '',
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
        status: s.status || 'scheduled',
        room: s.room || '',
        makeup_for: s.makeupFor || '',
        rescheduled_from: s.rescheduledFrom || '',
        created_at: now(),
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

// 按 ID 查单条排课（调课/补课等场景需要）
export async function getScheduleById(scheduleId) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM schedules WHERE id=?').get(scheduleId)
  return row ? rowToSchedule(row) : null
}

function insertSchedule(db, s, id) {
  db.prepare(`INSERT INTO schedules
    (id, student_id, student_name, class_id, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended, status, room, makeup_for, rescheduled_from, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    s.studentId,
    s.studentName,
    s.classId || '',
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
    s.status || 'scheduled',
    s.room || '',
    s.makeupFor || '',
    s.rescheduledFrom || '',
    now(),
  )
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
      let id = s.id || genScheduleId()
      const existRow = db.prepare('SELECT 1 FROM schedules WHERE id=?').get(id)
      let guard = 0
      while ((existRow || usedIds.has(id)) && guard < 100) {
        id = genScheduleId()
        guard++
      }
      if (db.prepare('SELECT 1 FROM schedules WHERE id=?').get(id) || usedIds.has(id)) {
        errors.push({ studentId: s.studentId, date: s.date, reason: 'id 碰撞重试耗尽' })
        skipped++
        continue
      }
      insertSchedule(db, s, id)
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
  const id = schedule.id || genScheduleId()
  if (db.prepare('SELECT 1 FROM schedules WHERE id=?').get(id)) {
    return { created: false, key, exists: true }
  }
  insertSchedule(db, schedule, id)
  return { created: true, key, exists: false, schedule: { ...schedule, id } }
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
    const before = rowToSchedule(exist)
    db.prepare(`UPDATE schedules SET
      student_id=?, student_name=?, class_id=?, course_id=?, course_name=?, teacher=?, location=?, date=?, start_time=?, end_time=?, note=?, color=?, status=?, room=?, makeup_for=?, rescheduled_from=?
      WHERE id=?`).run(
      newSchedule.studentId,
      newSchedule.studentName,
      newSchedule.classId || '',
      newSchedule.courseId || '',
      newSchedule.courseName,
      newSchedule.teacher || '',
      newSchedule.location || '',
      newSchedule.date,
      newSchedule.startTime || '',
      newSchedule.endTime || '',
      newSchedule.note || '',
      newSchedule.color || '',
      newSchedule.status || 'scheduled',
      newSchedule.room || '',
      newSchedule.makeupFor || '',
      newSchedule.rescheduledFrom || '',
      newSchedule.id,
    )
    const after = rowToSchedule(db.prepare('SELECT * FROM schedules WHERE id=?').get(newSchedule.id))
    return { moved: true, before, after }
  })
  const r = tx()
  return { ...r, fromKey: '', toKey: '' }
}

export async function deleteSchedule(scheduleId, studentId, date) {
  validateStorageId(studentId, 'studentId')
  validateDate(date, 'date')
  const db = getDb()
  const oldRow = db.prepare('SELECT * FROM schedules WHERE id=? AND student_id=?').get(scheduleId, studentId)
  const before = oldRow ? rowToSchedule(oldRow) : null
  const info = db.prepare('DELETE FROM schedules WHERE id=? AND student_id=?').run(scheduleId, studentId)
  return { deleted: info.changes > 0, count: info.changes, before }
}

// ========== 点名 ==========
// 扣减规则：赠课后扣
//   到课(扣1)：先扣 remaining_paid_hours，扣完再扣 remaining_gift_hours
//   改缺勤(加1)：先回退 remaining_gift_hours（不超过 gift_hours 上限），再加 remaining_paid_hours
export async function batchSetAttendance(items) {
  for (const item of items) {
    validateStorageId(item.studentId, 'studentId')
    validateDate(String(item.date), 'date')
  }
  const db = getDb()
  const errors = []
  let updatedSchedules = 0
  let updatedEnrollments = 0
  const touchedEnrollmentIds = new Set()

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

      if (!row.course_id) {
        errors.push(`排课 ${item.scheduleId} 未关联课程，跳过课时扣减`)
        continue
      }
      const enrRow = db.prepare(`SELECT * FROM enrollments
        WHERE student_id=? AND course_id=? AND status='active' AND (remaining_paid_hours > 0 OR remaining_gift_hours > 0)
        ORDER BY datetime(enrolled_at), datetime(created_at) LIMIT 1`).get(row.student_id, row.course_id)
      const enrFallback = !enrRow
        ? db.prepare(`SELECT * FROM enrollments WHERE student_id=? AND course_id=? AND status='active'
            ORDER BY datetime(enrolled_at), datetime(created_at) LIMIT 1`).get(row.student_id, row.course_id)
        : null
      const enr = enrRow || enrFallback
      if (!enr) {
        errors.push(`学员 ${row.student_id} 未报名课程 ${row.course_name || row.course_id}，跳过课时扣减`)
        continue
      }

      if (newAttended) {
        if (enr.remaining_paid_hours > 0) {
          enr.remaining_paid_hours -= 1
        } else if (enr.remaining_gift_hours > 0) {
          enr.remaining_gift_hours -= 1
        } else {
          errors.push(`学员 ${row.student_id} 课程 ${row.course_name || row.course_id} 剩余课时不足，已扣至负数边界（未实际扣减）`)
        }
      } else {
        if (enr.remaining_gift_hours < enr.gift_hours) {
          enr.remaining_gift_hours += 1
        } else {
          enr.remaining_paid_hours += 1
        }
      }
      db.prepare('UPDATE enrollments SET remaining_paid_hours=?, remaining_gift_hours=? WHERE id=?')
        .run(enr.remaining_paid_hours, enr.remaining_gift_hours, enr.id)
      touchedEnrollmentIds.add(enr.id)
    }
    updatedEnrollments = touchedEnrollmentIds.size
    return { updatedSchedules, updatedEnrollments }
  })
  const r = tx()
  return { ...r, errors }
}
