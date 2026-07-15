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
// 无 q 参数：返回全量学员（按创建时间排序）
// 有 q 参数：精确匹配优先，模糊匹配其次（name LIKE %q%），结果按「精确在前」排序
// SQL 下推到 DB 利用 idx_students_name 索引，避免 JS 全量遍历
export async function getStudents(q) {
  const db = getDb()
  if (!q || !q.trim()) {
    const rows = db.prepare('SELECT * FROM students WHERE deleted_at IS NULL ORDER BY created_at, id').all()
    return rows.map(rowToStudent)
  }
  const kw = q.trim()
  // 精确匹配 + 模糊匹配，用 CASE 保持「精确在前」的排序（与原 JS filter 行为一致）
  // 过滤已软删除的学员（deleted_at IS NULL）
  const rows = db.prepare(
    `SELECT * FROM students
     WHERE deleted_at IS NULL AND (name = ? OR name LIKE ?)
     ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, created_at, id`,
  ).all(kw, `%${kw}%`, kw)
  return rows.map(rowToStudent)
}

// 按 id 取单个学员（不存在/已删除返回 null）
export async function getStudentById(studentId) {
  if (!studentId) return null
  const db = getDb()
  const row = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(studentId)
  return row ? rowToStudent(row) : null
}

// 查询已软删除的学员（退费学员查询）：返回 deleted_at IS NOT NULL 的学员
// 用于结转退课-退费子页，展示被删除时仍有余额的学员（需退费）
export async function getDeletedStudents(q) {
  const db = getDb()
  let rows
  if (!q || !q.trim()) {
    rows = db.prepare('SELECT * FROM students WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, created_at DESC').all()
  } else {
    const kw = q.trim()
    rows = db.prepare(
      `SELECT * FROM students
       WHERE deleted_at IS NOT NULL AND (name = ? OR name LIKE ?)
       ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, deleted_at DESC`,
    ).all(kw, `%${kw}%`, kw)
  }
  return rows.map((r) => ({
    ...rowToStudent(r),
    deletedAt: r.deleted_at || '',
  }))
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
  const old = db.prepare('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL').get(student.id)
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

// 软删除学员：仅标记 deleted_at，保留所有关联数据（排课/报名/反馈/班级成员/调课记录等）
// 用于报表统计和历史追溯。查询学员时通过 deleted_at IS NULL 过滤已删除学员。
// 删除前须确保无剩余课时（由 API 层校验），退课时已取消未来未点名排课，故无需在此清理排课。
export async function deleteStudentWithSchedules(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const oldRow = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(studentId)
  if (!oldRow) {
    return { deletedScheduleFiles: 0, studentRemoved: false, before: null }
  }
  const before = rowToStudent(oldRow)
  // 软删除：仅标记 deleted_at，不删除任何关联数据
  db.prepare('UPDATE students SET deleted_at=? WHERE id=?').run(now(), studentId)
  return { deletedScheduleFiles: 0, studentRemoved: true, before }
}
