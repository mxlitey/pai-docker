import { getDb, validateStorageId } from './core.js'
import { genGradeId } from '../id.js'
import { now } from '../time.js'

// ========== 年级管理 ==========
// 年级作为主数据：学员/课程通过 grade 文本字段（年级名称）关联，便于显示与升班批量更新。
// 年级重命名时级联更新 students.grade / courses.grade，保持数据一致。
function rowToGrade(r) {
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order ?? 0,
    status: r.status || 'active',
    description: r.description || '',
    createdAt: r.created_at || '',
  }
}

export async function getGrades() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM grades ORDER BY sort_order, created_at, id').all()
  return rows.map(rowToGrade)
}

export async function getGradeById(gradeId) {
  if (!gradeId) return null
  const db = getDb()
  const row = db.prepare('SELECT * FROM grades WHERE id=?').get(gradeId)
  return row ? rowToGrade(row) : null
}

export async function addGrade(grade) {
  const db = getDb()
  const id = grade?.id || genGradeId()
  validateStorageId(id, 'grade.id')
  if (db.prepare('SELECT 1 FROM grades WHERE id = ?').get(id)) {
    return { created: false, exists: true }
  }
  const name = (grade.name || '').trim()
  if (!name) throw new Error('年级名称不能为空')
  if (db.prepare('SELECT 1 FROM grades WHERE name = ?').get(name)) {
    return { created: false, duplicateName: true }
  }
  const finalGrade = {
    id,
    name,
    sortOrder: Number(grade.sortOrder || 0),
    status: grade.status || 'active',
    description: grade.description || '',
  }
  db.prepare(`INSERT INTO grades (id, name, sort_order, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    finalGrade.id, finalGrade.name, finalGrade.sortOrder, finalGrade.status, finalGrade.description, now(),
  )
  return { created: true, exists: false, grade: finalGrade }
}

export async function updateGrade(grade) {
  validateStorageId(grade?.id, 'grade.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM grades WHERE id = ?').get(grade.id)
  if (!old) return { updated: false, notFound: true }
  const before = rowToGrade(old)
  const newName = (grade.name || '').trim()
  if (!newName) throw new Error('年级名称不能为空')
  // 同名校验（排除自身）
  const dup = db.prepare('SELECT 1 FROM grades WHERE name=? AND id<>?').get(newName, grade.id)
  if (dup) return { updated: false, duplicateName: true }
  const oldName = old.name
  const newSort = Number(grade.sortOrder ?? old.sort_order)
  const newStatus = grade.status || old.status
  const newDesc = grade.description ?? old.description

  const tx = db.transaction(() => {
    db.prepare(`UPDATE grades SET name=?, sort_order=?, status=?, description=? WHERE id=?`).run(
      newName, newSort, newStatus, newDesc, grade.id,
    )
    // 年级重命名：级联更新学员与课程的 grade 文本字段，保持显示一致
    if (oldName !== newName) {
      db.prepare('UPDATE students SET grade=? WHERE grade=?').run(newName, oldName)
      db.prepare('UPDATE courses SET grade=? WHERE grade=?').run(newName, oldName)
    }
    return { renamed: oldName !== newName, oldName, newName }
  })
  const r = tx()
  const after = { id: grade.id, name: newName, sortOrder: newSort, status: newStatus, description: newDesc, createdAt: old.created_at || '' }
  return { updated: true, notFound: false, before, after, ...r, grade: after }
}

export async function deleteGrade(gradeId) {
  validateStorageId(gradeId, 'grade.id')
  const db = getDb()
  const grade = db.prepare('SELECT * FROM grades WHERE id=?').get(gradeId)
  if (!grade) return { deleted: false, notFound: true }
  const before = rowToGrade(grade)
  // 引用检查：仍有学员/课程使用该年级名称则拒绝删除
  const studentCount = db.prepare("SELECT COUNT(*) as c FROM students WHERE grade=?").get(grade.name).c
  const courseCount = db.prepare("SELECT COUNT(*) as c FROM courses WHERE grade=?").get(grade.name).c
  if (studentCount > 0 || courseCount > 0) {
    return { deleted: false, inUse: true, studentCount, courseCount }
  }
  db.prepare('DELETE FROM grades WHERE id=?').run(gradeId)
  return { deleted: true, notFound: false, before }
}

// 批量升班：将 fromGradeName 年级的所有学员升级到 toGradeName
// 用于学年末批量把"三年级"学员整体迁到"四年级"。仅更新学员年级，不影响已有报名/排课。
export async function promoteStudents(fromGradeName, toGradeName) {
  if (!fromGradeName || !toGradeName) throw new Error('源年级与目标年级均不能为空')
  if (fromGradeName === toGradeName) return { promoted: 0, same: true }
  const db = getDb()
  const info = db.prepare('UPDATE students SET grade=? WHERE grade=?').run(toGradeName, fromGradeName)
  return { promoted: info.changes, same: false, fromGradeName, toGradeName }
}
