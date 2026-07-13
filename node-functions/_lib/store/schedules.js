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
    className: r.class_name || '',
    grade: r.grade || '',
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
    makeupFor: r.makeup_for || '',
    rescheduledFrom: r.rescheduled_from || '',
    deductedEnrollmentId: r.deducted_enrollment_id || '',
    deductedType: r.deducted_type || '',
  }
}

// ========== 排课 ==========
// 按学员 + 月份查询排课（用日期范围替代 substr 击穿索引）
export async function getSchedulesByMonth(studentId, month) {
  validateStorageId(studentId, 'studentId')
  validateMonth(month, 'month')
  const db = getDb()
  // month 形如 'yyyy-MM'，转为 [月初, 下月初) 范围，使 idx_schedules_student_date 全程可用
  const [y, m] = month.split('-').map(Number)
  const start = month + '-01'
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const rows = db.prepare(`SELECT * FROM schedules
    WHERE student_id=? AND date >= ? AND date < ?
    ORDER BY date, start_time`).all(studentId, start, nextMonth)
  return rows.map(rowToSchedule)
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

export async function searchSchedules({ startDate, endDate, courseId, grade, teacher, classId } = {}) {
  const db = getDb()
  // LEFT JOIN classes/courses 取班级名和年级，供点名页按「班级(课程)年级」分组展示
  let sql = `SELECT s.*, c.name AS class_name, COALESCE(c.grade, co.grade) AS grade
    FROM schedules s
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN courses co ON co.id = s.course_id
    WHERE 1=1`
  const params = []
  if (startDate) { sql += ' AND s.date>=?'; params.push(startDate) }
  if (endDate) { sql += ' AND s.date<=?'; params.push(endDate) }
  if (courseId) { sql += ' AND s.course_id=?'; params.push(courseId) }
  if (grade) { sql += ' AND s.student_id IN (SELECT id FROM students WHERE grade=?)'; params.push(grade) }
  if (teacher) { sql += ' AND s.teacher=?'; params.push(teacher) }
  if (classId) { sql += ' AND s.class_id=?'; params.push(classId) }
  sql += ' ORDER BY s.date, s.start_time'
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
    (id, student_id, student_name, class_id, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended, status, makeup_for, rescheduled_from, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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

  // 预构建缓存，避免事务内重复查询
  const courseCache = new Map()
  const studentCache = new Map()
  const enrollmentCache = new Map() // key: `${studentId}|${courseId}`

  const courseExists = (courseId) => {
    if (!courseId) return true
    if (courseCache.has(courseId)) return courseCache.get(courseId)
    const row = db.prepare('SELECT 1 FROM courses WHERE id=?').get(courseId)
    const exists = !!row
    courseCache.set(courseId, exists)
    return exists
  }
  const studentExists = (studentId) => {
    if (studentCache.has(studentId)) return studentCache.get(studentId)
    const row = db.prepare('SELECT 1 FROM students WHERE id=?').get(studentId)
    const exists = !!row
    studentCache.set(studentId, exists)
    return exists
  }
  const enrollmentExists = (studentId, courseId) => {
    const key = `${studentId}|${courseId}`
    if (enrollmentCache.has(key)) return enrollmentCache.get(key)
    const row = db.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=? AND status='active'").get(studentId, courseId)
    const exists = !!row
    enrollmentCache.set(key, exists)
    return exists
  }

  const tx = db.transaction(() => {
    for (const s of schedules) {
      // 课程存在性校验
      if (s.courseId && !courseExists(s.courseId)) {
        errors.push({ studentId: s.studentId, date: s.date, reason: `课程 ${s.courseName || s.courseId} 不存在，跳过` })
        skipped++
        continue
      }
      // 学员存在性校验
      if (!studentExists(s.studentId)) {
        errors.push({ studentId: s.studentId, date: s.date, reason: `学员 ${s.studentId} 不存在，跳过` })
        skipped++
        continue
      }
      // 报名校验（非补课才检查）
      if (!s.makeupFor && s.courseId && !enrollmentExists(s.studentId, s.courseId)) {
        errors.push({ studentId: s.studentId, date: s.date, reason: `学员 ${s.studentId} 未报名课程 ${s.courseName || s.courseId}，跳过` })
        skipped++
        continue
      }
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
      student_id=?, student_name=?, class_id=?, course_id=?, course_name=?, teacher=?, location=?, date=?, start_time=?, end_time=?, note=?, color=?, status=?, makeup_for=?, rescheduled_from=?
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
      // 首次点名标缺勤(undefined→false):只更新状态，不调整课时
      // (排课尚未发生，标缺勤不应增加课时)
      if (oldAttended === undefined && !newAttended) {
        db.prepare('UPDATE schedules SET attended=? WHERE id=?').run(0, item.scheduleId)
        updatedSchedules++
        continue
      }

      if (!row.course_id) {
        errors.push(`排课 ${item.scheduleId} 未关联课程，跳过课时扣减`)
        continue
      }
      // 查找报名记录用于扣减课时
      // 插班补课场景：新排课的 course_id 可能是插班课程，学员未报名该课程。
      // 此时回退到原排课（makeup_for 指向）的 course_id 查找报名，扣原课程的课时。
      const findEnrollment = (courseId) => {
        const withRemaining = db.prepare(`SELECT * FROM enrollments
          WHERE student_id=? AND course_id=? AND status='active' AND (remaining_paid_hours > 0 OR remaining_gift_hours > 0)
          ORDER BY enrolled_at, created_at LIMIT 1`).get(row.student_id, courseId)
        if (withRemaining) return withRemaining
        return db.prepare(`SELECT * FROM enrollments WHERE student_id=? AND course_id=? AND status='active'
          ORDER BY enrolled_at, created_at LIMIT 1`).get(row.student_id, courseId)
      }

      if (newAttended) {
        // === 到课：扣减课时 ===
        let enr = findEnrollment(row.course_id)
        let deductedCourseName = row.course_name || row.course_id
        // 补课且当前课程找不到报名：回退到原排课课程扣课时
        if (!enr && row.makeup_for) {
          const originalRow = db.prepare('SELECT * FROM schedules WHERE id=?').get(row.makeup_for)
          if (originalRow && originalRow.course_id && originalRow.course_id !== row.course_id) {
            enr = findEnrollment(originalRow.course_id)
            deductedCourseName = originalRow.course_name || originalRow.course_id
          }
        }
        if (!enr) {
          errors.push(`学员 ${row.student_id} 未报名课程 ${row.course_name || row.course_id}（含原排课课程），跳过课时扣减`)
          continue
        }
        // 到课但剩余课时为 0：不更新 attended，保持状态一致（避免"已到课但未扣课时"）
        if (enr.remaining_paid_hours <= 0 && enr.remaining_gift_hours <= 0) {
          errors.push(`学员 ${row.student_id} 课程 ${deductedCourseName} 剩余课时不足，无法标记到课`)
          continue
        }
        // 扣减：先扣付费，后扣赠课；记录扣的是哪条报名、哪种类型，回退时精准回退
        let deductedType
        if (enr.remaining_paid_hours > 0) {
          enr.remaining_paid_hours -= 1
          deductedType = 'paid'
        } else {
          enr.remaining_gift_hours -= 1
          deductedType = 'gift'
        }
        db.prepare('UPDATE enrollments SET remaining_paid_hours=?, remaining_gift_hours=? WHERE id=?')
          .run(enr.remaining_paid_hours, enr.remaining_gift_hours, enr.id)
        // 课时校验通过，更新 attended 状态并记录扣减来源
        db.prepare('UPDATE schedules SET attended=?, deducted_enrollment_id=?, deducted_type=? WHERE id=?')
          .run(1, enr.id, deductedType, item.scheduleId)
        updatedSchedules++
        touchedEnrollmentIds.add(enr.id)
      } else {
        // === 改缺勤：回退课时 ===
        // 优先按当初扣减记录的 enrollment_id 和 type 精准回退（修复回退到错误报名/错误课时类型）
        const deductedEnrollmentId = row.deducted_enrollment_id
        const deductedType = row.deducted_type
        let enr = null
        if (deductedEnrollmentId) {
          enr = db.prepare('SELECT * FROM enrollments WHERE id=?').get(deductedEnrollmentId)
        }
        if (enr && deductedType === 'paid') {
          // 当初扣的是付费，回退到付费
          enr.remaining_paid_hours += 1
        } else if (enr && deductedType === 'gift') {
          // 当初扣的是赠课，回退到赠课
          enr.remaining_gift_hours += 1
        } else {
          // 无扣减记录（旧数据兼容）：回退到启发式查找的报名
          enr = findEnrollment(row.course_id)
          let deductedCourseName = row.course_name || row.course_id
          if (!enr && row.makeup_for) {
            const originalRow = db.prepare('SELECT * FROM schedules WHERE id=?').get(row.makeup_for)
            if (originalRow && originalRow.course_id && originalRow.course_id !== row.course_id) {
              enr = findEnrollment(originalRow.course_id)
              deductedCourseName = originalRow.course_name || originalRow.course_id
            }
          }
          if (!enr) {
            errors.push(`学员 ${row.student_id} 回退课时找不到报名记录，跳过`)
            continue
          }
          // 启发式回退：先回赠课（不超过 gift_hours 上限），后回付费
          if (enr.remaining_gift_hours < enr.gift_hours) {
            enr.remaining_gift_hours += 1
          } else {
            enr.remaining_paid_hours += 1
          }
        }
        db.prepare('UPDATE enrollments SET remaining_paid_hours=?, remaining_gift_hours=? WHERE id=?')
          .run(enr.remaining_paid_hours, enr.remaining_gift_hours, enr.id)
        db.prepare('UPDATE schedules SET attended=?, deducted_enrollment_id=?, deducted_type=? WHERE id=?')
          .run(0, '', '', item.scheduleId)
        updatedSchedules++
        touchedEnrollmentIds.add(enr.id)
      }
    }
    updatedEnrollments = touchedEnrollmentIds.size
    return { updatedSchedules, updatedEnrollments }
  })
  const r = tx()
  return { ...r, errors }
}

// 批量查询哪些排课已有补课排课（makeup_for 指向）
// 返回 Set<string>，包含所有已有补课的原排课 id
export async function getScheduleIdsWithMakeup(scheduleIds) {
  if (!scheduleIds || scheduleIds.length === 0) return new Set()
  const db = getDb()
  const placeholders = scheduleIds.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT DISTINCT makeup_for FROM schedules WHERE makeup_for IN (${placeholders}) AND status != 'cancelled'`,
  ).all(...scheduleIds)
  return new Set(rows.map((r) => r.makeup_for).filter(Boolean))
}

// 排课时间冲突检测：同一学员同一日期，时间段重叠的 scheduled 排课
// 返回冲突排课列表（不含已取消/已点名历史排课）；excludeId 用于排课更新场景排除自身
export async function findScheduleConflicts(studentId, date, startTime, endTime, excludeId = '') {
  const db = getDb()
  if (!studentId || !date || !startTime || !endTime) return []
  const rows = db.prepare(
    `SELECT * FROM schedules
     WHERE student_id=? AND date=? AND status='scheduled'
       AND start_time < ? AND end_time > ?
       AND (? = '' OR id != ?)
     ORDER BY start_time`,
  ).all(studentId, date, endTime, startTime, excludeId, excludeId)
  return rows.map(rowToSchedule)
}
