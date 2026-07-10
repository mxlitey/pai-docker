// 调课记录 store
// schedule_changes 表记录每次调课操作：原排课 → 新排课的关联链
import { getDb } from './core.js'
import { genScheduleChangeId, genScheduleId } from '../id.js'
import { now } from '../time.js'

// ========== 行 <-> 对象 映射 ==========
function rowToChange(r) {
  if (!r) return null
  return {
    id: r.id,
    originalScheduleId: r.original_schedule_id,
    newScheduleId: r.new_schedule_id || '',
    studentId: r.student_id || '',
    studentName: r.student_name || '',
    courseName: r.course_name || '',
    beforeDate: r.before_date || '',
    beforeStartTime: r.before_start_time || '',
    beforeEndTime: r.before_end_time || '',
    afterDate: r.after_date || '',
    afterStartTime: r.after_start_time || '',
    afterEndTime: r.after_end_time || '',
    reason: r.reason || '',
    operatorId: r.operator_id || '',
    createdAt: r.created_at || '',
  }
}

// ========== 调课操作（事务）：原排课标记 cancelled + 新排课插入 + 写 change 记录 ==========
// 参数：{ newDate, newStartTime, newEndTime, reason, operatorId, newTeacher?, newCourseId?, newCourseName?, newClassId?, newLocation? }
// 插班字段可选：传则覆盖原排课对应字段（支持调课到别的老师/班级）
// original 为 getScheduleById 的返回值（由 API 层预先加载传入）
export async function rescheduleSchedule(original, opts) {
  const {
    newDate, newStartTime, newEndTime, reason, operatorId,
    newTeacher, newCourseId, newCourseName, newClassId, newLocation, newColor,
  } = opts
  const db = getDb()
  const tx = db.transaction(() => {
    // 1. 原排课标记为 cancelled
    db.prepare("UPDATE schedules SET status='cancelled' WHERE id=?").run(original.id)

    // 2. 生成新排课（复制原排课，替换日期/时间，状态重置为 scheduled，标记来源）
    //    插班字段：传了就覆盖原排课的课程/班级/老师/地点/颜色
    const newId = genScheduleId()
    const newSchedule = {
      ...original,
      id: newId,
      date: newDate,
      startTime: newStartTime || original.startTime || '',
      endTime: newEndTime || original.endTime || '',
      status: 'scheduled',
      attended: undefined, // 新排课未点名
      makeupFor: original.makeupFor || '', // 保留补课关联
      rescheduledFrom: original.id, // 标记调课来源
      // 插班字段（可选覆盖）
      teacher: newTeacher !== undefined ? newTeacher : (original.teacher || ''),
      courseId: newCourseId !== undefined ? newCourseId : (original.courseId || ''),
      courseName: newCourseName !== undefined ? newCourseName : (original.courseName || ''),
      classId: newClassId !== undefined ? newClassId : (original.classId || ''),
      location: newLocation !== undefined ? newLocation : (original.location || ''),
      color: newColor !== undefined ? newColor : (original.color || ''),
    }
    db.prepare(`INSERT INTO schedules
      (id, student_id, student_name, class_id, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended, status, room, makeup_for, rescheduled_from, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId,
      newSchedule.studentId,
      newSchedule.studentName,
      newSchedule.classId || '',
      newSchedule.courseId || '',
      newSchedule.courseName,
      newSchedule.teacher || '',
      newSchedule.location || '',
      newSchedule.date,
      newSchedule.startTime,
      newSchedule.endTime,
      newSchedule.note || '',
      newSchedule.color || '',
      null,
      'scheduled',
      newSchedule.room || '',
      newSchedule.makeupFor || '',
      newSchedule.rescheduledFrom || '',
      now(),
    )

    // 3. 写入调课记录
    const changeId = genScheduleChangeId()
    db.prepare(`INSERT INTO schedule_changes
      (id, original_schedule_id, new_schedule_id, student_id, student_name, course_name,
       before_date, before_start_time, before_end_time,
       after_date, after_start_time, after_end_time,
       reason, operator_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      changeId,
      original.id,
      newId,
      original.studentId,
      original.studentName || '',
      original.courseName || '',
      original.date,
      original.startTime || '',
      original.endTime || '',
      newDate,
      newStartTime || '',
      newEndTime || '',
      reason || '',
      operatorId || '',
      now(),
    )

    return { changeId, newScheduleId: newId, original }
  })
  return tx()
}

// ========== 补课操作（事务）：保留原缺勤排课 + 生成新排课（设 makeup_for） ==========
// 与调课的区别：原排课不取消（保留缺勤记录），不写 schedule_changes
// 参数：{ newDate, newStartTime, newEndTime, reason, operatorId, newTeacher?, newCourseId?, newCourseName?, newClassId?, newLocation? }
// 插班字段可选：传则覆盖原排课对应字段（支持补课到别的老师/班级）
// original 为 getScheduleById 的返回值（由 API 层预先加载传入，须 attended===false）
export async function makeupSchedule(original, opts) {
  const {
    newDate, newStartTime, newEndTime, reason, operatorId,
    newTeacher, newCourseId, newCourseName, newClassId, newLocation, newColor,
  } = opts
  const db = getDb()
  const tx = db.transaction(() => {
    // 生成新排课（复制原排课，替换日期/时间，标记为补课）
    // 插班字段：传了就覆盖原排课的课程/班级/老师/地点/颜色
    const newId = genScheduleId()
    const newSchedule = {
      ...original,
      id: newId,
      date: newDate,
      startTime: newStartTime || original.startTime || '',
      endTime: newEndTime || original.endTime || '',
      status: 'scheduled',
      attended: undefined, // 新排课未点名
      makeupFor: original.id, // 标记补课关联
      rescheduledFrom: '', // 补课不设调课来源
      // 插班字段（可选覆盖）
      teacher: newTeacher !== undefined ? newTeacher : (original.teacher || ''),
      courseId: newCourseId !== undefined ? newCourseId : (original.courseId || ''),
      courseName: newCourseName !== undefined ? newCourseName : (original.courseName || ''),
      classId: newClassId !== undefined ? newClassId : (original.classId || ''),
      location: newLocation !== undefined ? newLocation : (original.location || ''),
      color: newColor !== undefined ? newColor : (original.color || ''),
    }
    db.prepare(`INSERT INTO schedules
      (id, student_id, student_name, class_id, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended, status, room, makeup_for, rescheduled_from, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId,
      newSchedule.studentId,
      newSchedule.studentName,
      newSchedule.classId || '',
      newSchedule.courseId || '',
      newSchedule.courseName,
      newSchedule.teacher || '',
      newSchedule.location || '',
      newSchedule.date,
      newSchedule.startTime,
      newSchedule.endTime,
      newSchedule.note || '',
      newSchedule.color || '',
      null,
      'scheduled',
      newSchedule.room || '',
      newSchedule.makeupFor || '',
      newSchedule.rescheduledFrom || '',
      now(),
    )
    return { newScheduleId: newId, original }
  })
  return tx()
}

// ========== 查询调课历史 ==========
// 支持按 scheduleId（原或新）或 studentId 查询
export async function getScheduleChanges({ scheduleId, studentId, limit } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM schedule_changes WHERE 1=1'
  const params = []
  if (scheduleId) {
    sql += ' AND (original_schedule_id=? OR new_schedule_id=?)'
    params.push(scheduleId, scheduleId)
  }
  if (studentId) {
    sql += ' AND student_id=?'
    params.push(studentId)
  }
  sql += ' ORDER BY datetime(created_at) DESC'
  if (limit && limit > 0) {
    sql += ' LIMIT ?'
    params.push(limit)
  }
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToChange)
}
