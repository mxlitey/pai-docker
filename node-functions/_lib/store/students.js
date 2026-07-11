import { getDb, validateStorageId } from './core.js'
import { genStudentId } from '../id.js'
import { now } from '../time.js'

// ========== 行 <-> 对象 映射 ==========
function rowToStudent(r) {
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    grade: r.grade || '',
    phone: r.phone || '',
    parentName: r.parent_name || '',
    gender: r.gender || '',
    birthday: r.birthday || '',
    status: r.status || 'active',
    tags: r.tags || '',
    remark: r.remark || '',
    source: r.source || '',
    balance: typeof r.balance === 'number' ? r.balance : Number(r.balance || 0),
    createdAt: r.created_at || '',
  }
}

// ========== 学员 ==========
export async function getStudents() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM students ORDER BY created_at, id').all()
  return rows.map(rowToStudent)
}

// 按 id 取单个学员（不存在返回 null）
export async function getStudentById(studentId) {
  if (!studentId) return null
  const db = getDb()
  const row = db.prepare('SELECT * FROM students WHERE id=?').get(studentId)
  return row ? rowToStudent(row) : null
}

export async function addStudent(student) {
  const db = getDb()
  // id 由后端统一生成（前端不再传 id）；兼容旧前端传入 id
  const id = student?.id || genStudentId()
  validateStorageId(id, 'student.id')
  if (db.prepare('SELECT 1 FROM students WHERE id = ?').get(id)) {
    return { created: false, exists: true, student: rowToStudent({ id, name: student.name }) }
  }
  const finalStudent = {
    id,
    name: student.name,
    grade: student.grade || '',
    phone: student.phone || '',
    parentName: student.parentName || '',
    gender: student.gender || '',
    birthday: student.birthday || '',
    status: student.status || 'active',
    tags: student.tags || '',
    remark: student.remark || '',
    source: student.source || '',
  }
  db.prepare(`INSERT INTO students
    (id, name, grade, phone, parent_name, gender, birthday, status, tags, remark, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    finalStudent.id, finalStudent.name, finalStudent.grade, finalStudent.phone,
    finalStudent.parentName, finalStudent.gender, finalStudent.birthday, finalStudent.status,
    finalStudent.tags, finalStudent.remark, finalStudent.source, now(),
  )
  // 返回 DB 行（含 balance 等默认字段）
  return { created: true, exists: false, student: rowToStudent(db.prepare('SELECT * FROM students WHERE id=?').get(id)) }
}

export async function updateStudent(student) {
  validateStorageId(student?.id, 'student.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM students WHERE id = ?').get(student.id)
  if (!old) return { updated: false, notFound: true, nameChanged: false, updatedScheduleFiles: 0 }
  const before = rowToStudent(old)
  const nameChanged = old.name !== student.name
  db.prepare(`UPDATE students SET name=?, grade=?, phone=?, parent_name=?, gender=?, birthday=?, status=?, tags=?, remark=?, source=? WHERE id=?`).run(
    student.name,
    student.grade || '',
    student.phone || '',
    student.parentName || '',
    student.gender || '',
    student.birthday || '',
    student.status || 'active',
    student.tags || '',
    student.remark || '',
    student.source || '',
    student.id,
  )
  // 姓名变更：级联更新排课中的 student_name
  let updatedScheduleFiles = 0
  if (nameChanged) {
    const info = db.prepare('UPDATE schedules SET student_name=? WHERE student_id=?').run(student.name, student.id)
    updatedScheduleFiles = info.changes > 0 ? 1 : 0
  }
  const after = rowToStudent({ ...old, name: student.name, grade: student.grade || '', phone: student.phone || '', parent_name: student.parentName || '', gender: student.gender || '', birthday: student.birthday || '', status: student.status || 'active', tags: student.tags || '', remark: student.remark || '', source: student.source || '' })
  return { updated: true, notFound: false, nameChanged, updatedScheduleFiles, before, after, student: after }
}

export async function deleteStudentWithSchedules(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const tx = db.transaction(() => {
    const oldRow = db.prepare('SELECT * FROM students WHERE id=?').get(studentId)
    const before = oldRow ? rowToStudent(oldRow) : null
    const del = db.prepare('DELETE FROM schedules WHERE student_id=?').run(studentId)
    db.prepare('DELETE FROM enrollments WHERE student_id=?').run(studentId)
    db.prepare('DELETE FROM transfers WHERE student_id=?').run(studentId)
    db.prepare('DELETE FROM account_transactions WHERE student_id=?').run(studentId)
    // 补齐级联：避免删除学员后产生孤儿反馈/班级成员/调课记录数据
    db.prepare('DELETE FROM feedback WHERE student_id=?').run(studentId)
    db.prepare('DELETE FROM class_members WHERE student_id=?').run(studentId)
    db.prepare('DELETE FROM schedule_changes WHERE student_id=?').run(studentId)
    const stu = db.prepare('DELETE FROM students WHERE id=?').run(studentId)
    return { deletedScheduleFiles: del.changes > 0 ? 1 : 0, studentRemoved: stu.changes > 0, before }
  })
  return tx()
}
