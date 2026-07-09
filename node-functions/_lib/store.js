// SQLite 存储层
// 数据组织：
//   students     表 -> 学员（含联系方式/状态/来源等档案信息）
//   courses      表 -> 课程（含单价 unit_price、计费方式 billing_type、容量等）
//   schedules    表 -> 排课（按 student_id + date 索引查询）
//   enrollments  表 -> 报名记录（学员×课程，按课程独立计费；赠课后扣）
//   transfers    表 -> 结转流水（按金额 / 按课时）
//   admins       表 -> 管理员账号（超管/管理员/教师，RBAC）
//   audit_logs   表 -> 审计日志（所有写操作留痕）
//   announcement 表 -> 公告（单行）
// 注：项目名称、token 签名密钥等高频读取的系统配置存于 config.json，不占 DB
//
// 计费模型说明：
// - 课时挂在「报名记录 enrollment」上，按课程独立核算（不再挂在学员身上）
// - 一个学员可报名多个课程；同一课程可多次续费报名
// - 点名扣减规则：赠课后扣 —— 到课先扣付费剩余，扣完再扣赠课；改缺勤先回退赠课
// - 结转：把源 enrollment 剩余价值转移到目标 enrollment，支持按金额(default)/按课时
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  genScheduleId, genEnrollmentId, genTransferId,
  genStudentId, genCourseId, genAdminId, genAuditId,
  genFeedbackId, genCouponId, genMembershipId, genStudentMembershipId,
  genLeadId, genFollowupId,
} from './id.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 数据目录：优先环境变量，否则项目根 data/
const DATA_DIR = process.env.DATA_DIR
  || join(__dirname, '..', '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = join(DATA_DIR, 'pai.db')

// 暴露数据目录与库路径（供备份/恢复模块使用）
export const STORE_DATA_DIR = DATA_DIR
export const STORE_DB_PATH = DB_PATH

// 单例连接
let dbInstance = null
export function getDb() {
  if (dbInstance) return dbInstance
  const db = new Database(DB_PATH)
  // WAL 模式：读不阻塞写，并发友好
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // 建表（完整新 schema）
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      grade        TEXT DEFAULT '',
      phone        TEXT DEFAULT '',
      parent_name  TEXT DEFAULT '',
      gender       TEXT DEFAULT '',
      birthday     TEXT DEFAULT '',
      status       TEXT DEFAULT 'active',
      tags         TEXT DEFAULT '',
      remark       TEXT DEFAULT '',
      source       TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      teacher            TEXT DEFAULT '',
      location           TEXT DEFAULT '',
      color              TEXT DEFAULT '',
      default_start_time TEXT DEFAULT '',
      default_end_time   TEXT DEFAULT '',
      unit_price         REAL DEFAULT 0,
      billing_type       TEXT DEFAULT 'per_lesson',
      capacity           INTEGER DEFAULT 0,
      term               TEXT DEFAULT '',
      status             TEXT DEFAULT 'active',
      category           TEXT DEFAULT '',
      description        TEXT DEFAULT '',
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
      status       TEXT DEFAULT 'scheduled',
      room         TEXT DEFAULT '',
      makeup_for   TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_schedules_student_date ON schedules(student_id, date);
    CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
    CREATE INDEX IF NOT EXISTS idx_schedules_student ON schedules(student_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_course ON schedules(course_id);

    CREATE TABLE IF NOT EXISTS enrollments (
      id                    TEXT PRIMARY KEY,
      student_id            TEXT NOT NULL,
      course_id             TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'active',
      purchased_hours       INTEGER NOT NULL DEFAULT 0,
      gift_hours            INTEGER NOT NULL DEFAULT 0,
      remaining_paid_hours  INTEGER NOT NULL DEFAULT 0,
      remaining_gift_hours  INTEGER NOT NULL DEFAULT 0,
      unit_price            REAL NOT NULL DEFAULT 0,
      total_amount          REAL NOT NULL DEFAULT 0,
      paid_amount           REAL NOT NULL DEFAULT 0,
      discount_amount       REAL NOT NULL DEFAULT 0,
      channel               TEXT DEFAULT '',
      sales_id              TEXT DEFAULT '',
      payment_method        TEXT DEFAULT '',
      payment_status        TEXT DEFAULT 'paid',
      contract_no           TEXT DEFAULT '',
      expired_at            TEXT DEFAULT '',
      operator_id           TEXT DEFAULT '',
      enrolled_at           TEXT,
      note                  TEXT DEFAULT '',
      created_at            TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_student_course ON enrollments(student_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);

    CREATE TABLE IF NOT EXISTS transfers (
      id                    TEXT PRIMARY KEY,
      student_id            TEXT NOT NULL,
      from_enrollment_id    TEXT NOT NULL,
      to_enrollment_id      TEXT NOT NULL,
      mode                  TEXT NOT NULL,
      transferred_hours     INTEGER NOT NULL DEFAULT 0,
      transferred_amount    REAL NOT NULL DEFAULT 0,
      leftover_amount       REAL NOT NULL DEFAULT 0,
      from_unit_price       REAL NOT NULL DEFAULT 0,
      to_unit_price         REAL NOT NULL DEFAULT 0,
      operator_id           TEXT DEFAULT '',
      reason                TEXT DEFAULT '',
      note                  TEXT DEFAULT '',
      created_at            TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transfers_student ON transfers(student_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_enrollment_id);

    CREATE TABLE IF NOT EXISTS admins (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      real_name     TEXT DEFAULT '',
      phone         TEXT DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'active',
      teacher_id    TEXT DEFAULT '',
      last_login_at TEXT DEFAULT '',
      last_login_ip TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now')),
      created_by    TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id           TEXT PRIMARY KEY,
      actor_id     TEXT NOT NULL,
      actor_name   TEXT NOT NULL,
      actor_role   TEXT NOT NULL,
      action       TEXT NOT NULL,
      module       TEXT NOT NULL,
      target_type  TEXT DEFAULT '',
      target_id    TEXT DEFAULT '',
      target_name  TEXT DEFAULT '',
      summary      TEXT DEFAULT '',
      before_json  TEXT DEFAULT '',
      after_json   TEXT DEFAULT '',
      ip           TEXT DEFAULT '',
      user_agent   TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS announcement (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      content    TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
    INSERT OR IGNORE INTO announcement (id, content, updated_at) VALUES (1, '', '');

    CREATE TABLE IF NOT EXISTS feedback (
      id           TEXT PRIMARY KEY,
      schedule_id  TEXT NOT NULL DEFAULT '',
      course_id    TEXT NOT NULL DEFAULT '',
      teacher_id   TEXT DEFAULT '',
      teacher_name TEXT DEFAULT '',
      student_id   TEXT NOT NULL DEFAULT '',
      student_name TEXT DEFAULT '',
      date         TEXT NOT NULL DEFAULT '',
      content      TEXT DEFAULT '',
      rating       INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_schedule ON feedback(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_teacher ON feedback(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_student ON feedback(student_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_course ON feedback(course_id);

    CREATE TABLE IF NOT EXISTS coupons (
      id            TEXT PRIMARY KEY,
      code          TEXT NOT NULL UNIQUE,
      name          TEXT DEFAULT '',
      type          TEXT NOT NULL DEFAULT 'discount',
      value         REAL NOT NULL DEFAULT 0,
      min_amount    REAL NOT NULL DEFAULT 0,
      valid_from    TEXT DEFAULT '',
      valid_to      TEXT DEFAULT '',
      usage_limit   INTEGER NOT NULL DEFAULT 0,
      used_count    INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'active',
      remark        TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id            TEXT PRIMARY KEY,
      coupon_id     TEXT NOT NULL,
      enrollment_id TEXT NOT NULL,
      student_id    TEXT NOT NULL,
      discount      REAL NOT NULL DEFAULT 0,
      operator_id   TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_redemption_coupon ON coupon_redemptions(coupon_id);
    CREATE INDEX IF NOT EXISTS idx_redemption_student ON coupon_redemptions(student_id);

    CREATE TABLE IF NOT EXISTS memberships (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'monthly',
      duration_days   INTEGER NOT NULL DEFAULT 30,
      price           REAL NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'active',
      benefits        TEXT DEFAULT '',
      remark          TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_memberships (
      id              TEXT PRIMARY KEY,
      student_id      TEXT NOT NULL,
      membership_id   TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active',
      started_at      TEXT NOT NULL,
      expired_at      TEXT DEFAULT '',
      paid_amount     REAL NOT NULL DEFAULT 0,
      operator_id     TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stu_membership_student ON student_memberships(student_id);

    CREATE TABLE IF NOT EXISTS leads (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      phone        TEXT DEFAULT '',
      grade        TEXT DEFAULT '',
      source       TEXT DEFAULT '',
      stage        TEXT NOT NULL DEFAULT 'new',
      intention    TEXT DEFAULT '',
      assigned_to  TEXT DEFAULT '',
      remark       TEXT DEFAULT '',
      converted    INTEGER NOT NULL DEFAULT 0,
      student_id   TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
    CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);

    CREATE TABLE IF NOT EXISTS lead_followups (
      id          TEXT PRIMARY KEY,
      lead_id     TEXT NOT NULL,
      content     TEXT DEFAULT '',
      stage       TEXT DEFAULT '',
      operator_id TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_followup_lead ON lead_followups(lead_id);
  `)

  // ===== 兼容已存在的旧库：补齐新增列 + 重建结构变化表（开发阶段） =====
  // students 旧表含 hours/remaining_hours，需重建删除（彻底移除只读汇总字段）
  rebuildStudentsTable(db)
  // 旧 admin 表 id 为 INTEGER 自增，需迁移到 admins（TEXT id）
  migrateLegacyAdminTable(db)
  // courses 补齐新增列
  for (const [col, def] of [
    ['unit_price', 'REAL DEFAULT 0'],
    ['billing_type', "TEXT DEFAULT 'per_lesson'"],
    ['capacity', 'INTEGER DEFAULT 0'],
    ['term', "TEXT DEFAULT ''"],
    ['status', "TEXT DEFAULT 'active'"],
    ['category', "TEXT DEFAULT ''"],
    ['description', "TEXT DEFAULT ''"],
  ]) ensureColumn(db, 'courses', col, def)
  // schedules 补齐新增列
  for (const [col, def] of [
    ['status', "TEXT DEFAULT 'scheduled'"],
    ['room', "TEXT DEFAULT ''"],
    ['makeup_for', "TEXT DEFAULT ''"],
  ]) ensureColumn(db, 'schedules', col, def)
  // enrollments 补齐新增列
  for (const [col, def] of [
    ['discount_amount', 'REAL NOT NULL DEFAULT 0'],
    ['channel', "TEXT DEFAULT ''"],
    ['sales_id', "TEXT DEFAULT ''"],
    ['payment_method', "TEXT DEFAULT ''"],
    ['payment_status', "TEXT DEFAULT 'paid'"],
    ['contract_no', "TEXT DEFAULT ''"],
    ['expired_at', "TEXT DEFAULT ''"],
    ['operator_id', "TEXT DEFAULT ''"],
  ]) ensureColumn(db, 'enrollments', col, def)
  // transfers 补齐新增列
  for (const [col, def] of [
    ['operator_id', "TEXT DEFAULT ''"],
    ['reason', "TEXT DEFAULT ''"],
  ]) ensureColumn(db, 'transfers', col, def)

  dbInstance = db
  return db
}

// 幂等加列：列不存在才 ADD（better-sqlite3 不支持 IF NOT EXISTS 语法）
function ensureColumn(db, table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
  }
}

// 重建 students 表：若旧表存在 hours 列，则迁移到新结构（删除 hours/remaining_hours）
function rebuildStudentsTable(db) {
  const cols = db.prepare('PRAGMA table_info(students)').all()
  const hasHours = cols.some((c) => c.name === 'hours' || c.name === 'remaining_hours')
  if (!hasHours) return
  // 已有列中保留与新表共有的
  const keepCols = ['id', 'name', 'grade', 'phone', 'parent_name', 'gender', 'birthday', 'status', 'tags', 'remark', 'source', 'created_at']
    .filter((c) => cols.some((col) => col.name === c))
  const list = keepCols.join(', ')
  db.exec('ALTER TABLE students RENAME TO students_old')
  db.exec(`
    CREATE TABLE students (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      grade        TEXT DEFAULT '',
      phone        TEXT DEFAULT '',
      parent_name  TEXT DEFAULT '',
      gender       TEXT DEFAULT '',
      birthday     TEXT DEFAULT '',
      status       TEXT DEFAULT 'active',
      tags         TEXT DEFAULT '',
      remark       TEXT DEFAULT '',
      source       TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `)
  if (list) {
    db.exec(`INSERT INTO students (${list}) SELECT ${list} FROM students_old`)
  }
  db.exec('DROP TABLE students_old')
}

// 迁移旧 admin 表（INTEGER id）到新 admins 表（TEXT id，前缀 adm_）
function migrateLegacyAdminTable(db) {
  // 新 admins 表已由 CREATE TABLE IF NOT EXISTS 创建
  // 检查是否存在旧 admin 表
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin'").get()
  if (!tables) return
  // 旧表是否存在
  const oldCols = db.prepare('PRAGMA table_info(admin)').all()
  const hasIntId = oldCols.some((c) => c.name === 'id' && (c.type || '').toUpperCase().includes('INT'))
  // 仅当旧表有数据且新 admins 表为空时迁移
  const oldCount = db.prepare('SELECT COUNT(*) AS c FROM admin').get()?.c || 0
  const newCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get()?.c || 0
  if (oldCount > 0 && newCount === 0) {
    const rows = db.prepare('SELECT username, password_hash, role FROM admin').all()
    for (const r of rows) {
      db.prepare(`INSERT INTO admins (id, username, password_hash, role) VALUES (?, ?, ?, ?)`)
        .run(genAdminId(), r.username || 'admin', r.password_hash, r.role || 'superadmin')
    }
  }
  // 旧表为 INTEGER id 或无数据但表存在：删除旧表避免混淆
  if (hasIntId || oldCount === 0) {
    db.exec('DROP TABLE IF EXISTS admin')
  }
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
    createdAt: r.created_at || '',
  }
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
    unitPrice: typeof r.unit_price === 'number' ? r.unit_price : Number(r.unit_price || 0),
    billingType: r.billing_type || 'per_lesson',
    capacity: r.capacity ?? 0,
    term: r.term || '',
    status: r.status || 'active',
    category: r.category || '',
    description: r.description || '',
    createdAt: r.created_at || '',
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
    status: r.status || 'scheduled',
    room: r.room || '',
    makeupFor: r.makeup_for || '',
  }
}
function rowToEnrollment(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    courseId: r.course_id,
    status: r.status || 'active',
    purchasedHours: r.purchased_hours ?? 0,
    giftHours: r.gift_hours ?? 0,
    remainingPaidHours: r.remaining_paid_hours ?? 0,
    remainingGiftHours: r.remaining_gift_hours ?? 0,
    unitPrice: typeof r.unit_price === 'number' ? r.unit_price : Number(r.unit_price || 0),
    totalAmount: typeof r.total_amount === 'number' ? r.total_amount : Number(r.total_amount || 0),
    paidAmount: typeof r.paid_amount === 'number' ? r.paid_amount : Number(r.paid_amount || 0),
    discountAmount: typeof r.discount_amount === 'number' ? r.discount_amount : Number(r.discount_amount || 0),
    channel: r.channel || '',
    salesId: r.sales_id || '',
    paymentMethod: r.payment_method || '',
    paymentStatus: r.payment_status || 'paid',
    contractNo: r.contract_no || '',
    expiredAt: r.expired_at || '',
    operatorId: r.operator_id || '',
    enrolledAt: r.enrolled_at || '',
    note: r.note || '',
    createdAt: r.created_at || '',
  }
}
function rowToTransfer(r) {
  if (!r) return null
  return {
    id: r.id,
    studentId: r.student_id,
    fromEnrollmentId: r.from_enrollment_id,
    toEnrollmentId: r.to_enrollment_id,
    mode: r.mode,
    transferredHours: r.transferred_hours ?? 0,
    transferredAmount: typeof r.transferred_amount === 'number' ? r.transferred_amount : Number(r.transferred_amount || 0),
    leftoverAmount: typeof r.leftover_amount === 'number' ? r.leftover_amount : Number(r.leftover_amount || 0),
    fromUnitPrice: typeof r.from_unit_price === 'number' ? r.from_unit_price : Number(r.from_unit_price || 0),
    toUnitPrice: typeof r.to_unit_price === 'number' ? r.to_unit_price : Number(r.to_unit_price || 0),
    operatorId: r.operator_id || '',
    reason: r.reason || '',
    note: r.note || '',
    createdAt: r.created_at || '',
  }
}
function rowToAdmin(r) {
  if (!r) return null
  return {
    id: r.id,
    username: r.username,
    role: r.role || 'admin',
    realName: r.real_name || '',
    phone: r.phone || '',
    status: r.status || 'active',
    teacherId: r.teacher_id || '',
    lastLoginAt: r.last_login_at || '',
    lastLoginIp: r.last_login_ip || '',
    createdAt: r.created_at || '',
    createdBy: r.created_by || '',
    // password_hash 不返回给前端
  }
}
function rowToAuditLog(r) {
  if (!r) return null
  return {
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    action: r.action,
    module: r.module,
    targetType: r.target_type || '',
    targetId: r.target_id || '',
    targetName: r.target_name || '',
    summary: r.summary || '',
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    ip: r.ip || '',
    userAgent: r.user_agent || '',
    createdAt: r.created_at || '',
  }
}

// ========== 学员 ==========
export async function getStudents() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM students ORDER BY created_at, id').all()
  return rows.map(rowToStudent)
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
    (id, name, grade, phone, parent_name, gender, birthday, status, tags, remark, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    finalStudent.id, finalStudent.name, finalStudent.grade, finalStudent.phone,
    finalStudent.parentName, finalStudent.gender, finalStudent.birthday, finalStudent.status,
    finalStudent.tags, finalStudent.remark, finalStudent.source,
  )
  return { created: true, exists: false, student: finalStudent }
}

export async function updateStudent(student) {
  validateStorageId(student?.id, 'student.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM students WHERE id = ?').get(student.id)
  if (!old) return { updated: false, notFound: true, nameChanged: false, updatedScheduleFiles: 0 }
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
  return { updated: true, notFound: false, nameChanged, updatedScheduleFiles, student: rowToStudent({ ...old, ...student }) }
}

export async function deleteStudentWithSchedules(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const tx = db.transaction(() => {
    const del = db.prepare('DELETE FROM schedules WHERE student_id=?').run(studentId)
    db.prepare('DELETE FROM enrollments WHERE student_id=?').run(studentId)
    db.prepare('DELETE FROM transfers WHERE student_id=?').run(studentId)
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
    description: course.description || '',
  }
  db.prepare(`INSERT INTO courses
    (id, name, teacher, location, color, default_start_time, default_end_time, unit_price, billing_type, capacity, term, status, category, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    finalCourse.id, finalCourse.name, finalCourse.teacher, finalCourse.location, finalCourse.color,
    finalCourse.defaultStartTime, finalCourse.defaultEndTime, finalCourse.unitPrice, finalCourse.billingType,
    finalCourse.capacity, finalCourse.term, finalCourse.status, finalCourse.category, finalCourse.description,
  )
  return { created: true, exists: false, course: finalCourse }
}

export async function updateCourse(course) {
  validateStorageId(course?.id, 'course.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(course.id)
  if (!old) return { updated: false, notFound: true }
  const info = db.prepare(`UPDATE courses SET
    name=?, teacher=?, location=?, color=?, default_start_time=?, default_end_time=?,
    unit_price=?, billing_type=?, capacity=?, term=?, status=?, category=?, description=?
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
    course.description || '',
    course.id,
  )
  return { updated: info.changes > 0, notFound: info.changes === 0, course: rowToCourse({ ...old, ...course }) }
}

export async function deleteCourseWithSchedules(courseId) {
  validateStorageId(courseId, 'courseId')
  const db = getDb()
  const tx = db.transaction(() => {
    const del = db.prepare('DELETE FROM schedules WHERE course_id=?').run(courseId)
    db.prepare('DELETE FROM enrollments WHERE course_id=?').run(courseId)
    const cou = db.prepare('DELETE FROM courses WHERE id=?').run(courseId)
    return {
      courseRemoved: cou.changes > 0,
      deletedScheduleCount: del.changes,
      deletedFiles: 0,
    }
  })
  return tx()
}

// ========== 报名记录（计费核心） ==========
export async function getEnrollments({ studentId, courseId, status } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM enrollments WHERE 1=1'
  const params = []
  if (studentId) { sql += ' AND student_id=?'; params.push(studentId) }
  if (courseId) { sql += ' AND course_id=?'; params.push(courseId) }
  if (status) { sql += ' AND status=?'; params.push(status) }
  sql += ' ORDER BY datetime(enrolled_at), datetime(created_at), id'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToEnrollment)
}

export async function getEnrollment(id) {
  const db = getDb()
  return rowToEnrollment(db.prepare('SELECT * FROM enrollments WHERE id=?').get(id))
}

// 点名扣减时定位报名记录：学员+课程下，取最早报名且仍有剩余的 active 记录
export async function findActiveEnrollmentForAttendance(studentId, courseId) {
  const db = getDb()
  const withRemaining = db.prepare(`SELECT * FROM enrollments
    WHERE student_id=? AND course_id=? AND status='active' AND (remaining_paid_hours > 0 OR remaining_gift_hours > 0)
    ORDER BY datetime(enrolled_at), datetime(created_at) LIMIT 1`).get(studentId, courseId)
  if (withRemaining) return rowToEnrollment(withRemaining)
  const anyActive = db.prepare(`SELECT * FROM enrollments
    WHERE student_id=? AND course_id=? AND status='active'
    ORDER BY datetime(enrolled_at), datetime(created_at) LIMIT 1`).get(studentId, courseId)
  return rowToEnrollment(anyActive)
}

export async function addEnrollment(enrollment) {
  const db = getDb()
  const id = enrollment?.id || genEnrollmentId()
  validateStorageId(id, 'enrollment.id')
  validateStorageId(enrollment?.studentId, 'enrollment.studentId')
  validateStorageId(enrollment?.courseId, 'enrollment.courseId')
  if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(enrollment.studentId)) {
    return { created: false, notFound: 'student' }
  }
  if (!db.prepare('SELECT 1 FROM courses WHERE id=?').get(enrollment.courseId)) {
    return { created: false, notFound: 'course' }
  }
  if (db.prepare('SELECT 1 FROM enrollments WHERE id=?').get(id)) {
    return { created: false, exists: true }
  }
  const purchased = Number(enrollment.purchasedHours || 0)
  const gift = Number(enrollment.giftHours || 0)
  const unitPrice = Number(enrollment.unitPrice || 0)
  db.prepare(`INSERT INTO enrollments
    (id, student_id, course_id, status, purchased_hours, gift_hours, remaining_paid_hours, remaining_gift_hours,
     unit_price, total_amount, paid_amount, discount_amount, channel, sales_id, payment_method, payment_status,
     contract_no, expired_at, operator_id, enrolled_at, note)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    enrollment.studentId,
    enrollment.courseId,
    purchased,
    gift,
    purchased,
    gift,
    unitPrice,
    Number(enrollment.totalAmount ?? (purchased * unitPrice)),
    Number(enrollment.paidAmount ?? (purchased * unitPrice)),
    Number(enrollment.discountAmount || 0),
    enrollment.channel || '',
    enrollment.salesId || '',
    enrollment.paymentMethod || '',
    enrollment.paymentStatus || 'paid',
    enrollment.contractNo || '',
    enrollment.expiredAt || '',
    enrollment.operatorId || '',
    enrollment.enrolledAt || new Date().toISOString(),
    enrollment.note || '',
  )
  return { created: true, exists: false, enrollment: { ...(rowToEnrollment(db.prepare('SELECT * FROM enrollments WHERE id=?').get(id))), id } }
}

// 更新报名：续费/补赠课/改价/改状态（课时为绝对值语义，差值即增量）
export async function updateEnrollment(enrollment) {
  validateStorageId(enrollment?.id, 'enrollment.id')
  const db = getDb()
  const old = db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollment.id)
  if (!old) return { updated: false, notFound: true }

  const tx = db.transaction(() => {
    const newPurchased = Number(enrollment.purchasedHours ?? old.purchased_hours)
    const newGift = Number(enrollment.giftHours ?? old.gift_hours)
    const purchasedDelta = newPurchased - old.purchased_hours
    const giftDelta = newGift - old.gift_hours
    const newRemainingPaid = Math.max(0, old.remaining_paid_hours + purchasedDelta)
    const newRemainingGift = Math.max(0, old.remaining_gift_hours + giftDelta)
    const unitPrice = Number(enrollment.unitPrice ?? old.unit_price)
    const totalAmount = Number(enrollment.totalAmount ?? (newPurchased * unitPrice))
    const paidAmount = Number(enrollment.paidAmount ?? old.paid_amount)
    const status = enrollment.status || old.status
    db.prepare(`UPDATE enrollments SET
      purchased_hours=?, gift_hours=?, remaining_paid_hours=?, remaining_gift_hours=?,
      unit_price=?, total_amount=?, paid_amount=?, discount_amount=?, channel=?, sales_id=?,
      payment_method=?, payment_status=?, contract_no=?, expired_at=?, status=?, note=? WHERE id=?`).run(
      newPurchased, newGift, newRemainingPaid, newRemainingGift,
      unitPrice, totalAmount, paidAmount,
      Number(enrollment.discountAmount ?? old.discount_amount),
      enrollment.channel ?? old.channel,
      enrollment.salesId ?? old.sales_id,
      enrollment.paymentMethod ?? old.payment_method,
      enrollment.paymentStatus ?? old.payment_status,
      enrollment.contractNo ?? old.contract_no,
      enrollment.expiredAt ?? old.expired_at,
      status,
      enrollment.note ?? old.note,
      enrollment.id,
    )
    return { purchasedDelta, giftDelta }
  })
  const r = tx()
  return { updated: true, notFound: false, ...r }
}

export async function deleteEnrollment(id) {
  validateStorageId(id, 'enrollment.id')
  const db = getDb()
  const info = db.prepare('DELETE FROM enrollments WHERE id=?').run(id)
  return { deleted: info.changes > 0 }
}

// 学员报名汇总（供学员管理页展示总购课/总剩余）
export async function getEnrollmentSummaryByStudent(studentId) {
  validateStorageId(studentId, 'studentId')
  const db = getDb()
  const rows = db.prepare(`SELECT
      COUNT(*) AS count,
      COALESCE(SUM(purchased_hours),0) AS purchased,
      COALESCE(SUM(gift_hours),0) AS gift,
      COALESCE(SUM(remaining_paid_hours),0) AS remainingPaid,
      COALESCE(SUM(remaining_gift_hours),0) AS remainingGift,
      COALESCE(SUM(total_amount),0) AS totalAmount,
      COALESCE(SUM(paid_amount),0) AS paidAmount
    FROM enrollments WHERE student_id=? AND status='active'`).get(studentId)
  return {
    count: rows?.count || 0,
    purchasedHours: rows?.purchased || 0,
    giftHours: rows?.gift || 0,
    remainingHours: (rows?.remainingPaid || 0) + (rows?.remainingGift || 0),
    remainingPaidHours: rows?.remainingPaid || 0,
    remainingGiftHours: rows?.remainingGift || 0,
    totalAmount: rows?.totalAmount || 0,
    paidAmount: rows?.paidAmount || 0,
  }
}

// 批量查询多学员报名汇总（一次查询，避免 N+1）
export async function getEnrollmentSummaries(studentIds) {
  if (!studentIds || studentIds.length === 0) return {}
  const db = getDb()
  const placeholders = studentIds.map(() => '?').join(',')
  const rows = db.prepare(`SELECT student_id,
      COUNT(*) AS count,
      COALESCE(SUM(purchased_hours),0) AS purchased,
      COALESCE(SUM(gift_hours),0) AS gift,
      COALESCE(SUM(remaining_paid_hours),0) AS remainingPaid,
      COALESCE(SUM(remaining_gift_hours),0) AS remainingGift,
      COALESCE(SUM(total_amount),0) AS totalAmount,
      COALESCE(SUM(paid_amount),0) AS paidAmount
    FROM enrollments WHERE student_id IN (${placeholders}) AND status='active'
    GROUP BY student_id`).all(...studentIds)
  const map = {}
  for (const r of rows) {
    map[r.student_id] = {
      count: r.count,
      purchasedHours: r.purchased,
      giftHours: r.gift,
      remainingHours: r.remainingPaid + r.remainingGift,
      remainingPaidHours: r.remainingPaid,
      remainingGiftHours: r.remainingGift,
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
    }
  }
  return map
}

// ========== 结转 ==========
// mode: 'amount'（默认，按金额折算）/ 'hours'（按课时平移）
export async function addTransfer(transfer) {
  const db = getDb()
  const id = transfer?.id || genTransferId()
  validateStorageId(id, 'transfer.id')
  validateStorageId(transfer?.studentId, 'transfer.studentId')
  validateStorageId(transfer?.fromEnrollmentId, 'transfer.fromEnrollmentId')
  validateStorageId(transfer?.toEnrollmentId, 'transfer.toEnrollmentId')
  if (transfer.fromEnrollmentId === transfer.toEnrollmentId) {
    return { created: false, reason: '源与目标报名记录不能相同' }
  }

  const tx = db.transaction(() => {
    const from = db.prepare('SELECT * FROM enrollments WHERE id=?').get(transfer.fromEnrollmentId)
    const to = db.prepare('SELECT * FROM enrollments WHERE id=?').get(transfer.toEnrollmentId)
    if (!from) throw new Error('源报名记录不存在')
    if (!to) throw new Error('目标报名记录不存在')
    if (from.student_id !== to.student_id) throw new Error('结转仅支持同一学员的报名记录')
    if (from.status !== 'active') throw new Error('源报名记录非进行中，不可结转')
    if (to.status !== 'active') throw new Error('目标报名记录非进行中，不可结转')

    const fromRemainingPaid = from.remaining_paid_hours
    const fromRemainingGift = from.remaining_gift_hours
    const fromTotalRemaining = fromRemainingPaid + fromRemainingGift
    if (fromTotalRemaining <= 0) throw new Error('源报名记录无剩余课时，不可结转')

    const mode = transfer.mode === 'hours' ? 'hours' : 'amount'
    const fromUnitPrice = Number(from.unit_price || 0)
    const toUnitPrice = Number(to.unit_price || 0)

    let transferredHours = 0
    let transferredAmount = 0
    let leftoverAmount = 0
    let toPurchasedAdd = 0
    let toGiftAdd = 0

    if (mode === 'hours') {
      transferredHours = fromTotalRemaining
      transferredAmount = fromTotalRemaining * fromUnitPrice
      toPurchasedAdd = fromRemainingPaid
      toGiftAdd = fromRemainingGift
    } else {
      transferredHours = fromTotalRemaining
      transferredAmount = fromTotalRemaining * fromUnitPrice
      if (toUnitPrice > 0) {
        toPurchasedAdd = Math.floor(transferredAmount / toUnitPrice)
        leftoverAmount = Math.round((transferredAmount - toPurchasedAdd * toUnitPrice) * 100) / 100
      } else {
        toPurchasedAdd = 0
        leftoverAmount = transferredAmount
      }
    }

    db.prepare(`UPDATE enrollments SET remaining_paid_hours=0, remaining_gift_hours=0, status='settled' WHERE id=?`)
      .run(from.id)
    db.prepare(`UPDATE enrollments SET
      purchased_hours = purchased_hours + ?,
      remaining_paid_hours = remaining_paid_hours + ?,
      gift_hours = gift_hours + ?,
      remaining_gift_hours = remaining_gift_hours + ?,
      total_amount = total_amount + ?,
      paid_amount = paid_amount + ?
      WHERE id=?`).run(
      toPurchasedAdd, toPurchasedAdd,
      toGiftAdd, toGiftAdd,
      transferredAmount, transferredAmount,
      to.id,
    )

    db.prepare(`INSERT INTO transfers
      (id, student_id, from_enrollment_id, to_enrollment_id, mode, transferred_hours, transferred_amount,
       leftover_amount, from_unit_price, to_unit_price, operator_id, reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      transfer.studentId,
      transfer.fromEnrollmentId,
      transfer.toEnrollmentId,
      mode,
      transferredHours,
      transferredAmount,
      leftoverAmount,
      fromUnitPrice,
      toUnitPrice,
      transfer.operatorId || '',
      transfer.reason || '',
      transfer.note || '',
    )

    return {
      id,
      mode,
      transferredHours,
      transferredAmount,
      leftoverAmount,
      toPurchasedAdd,
      toGiftAdd,
    }
  })

  const result = tx()
  return { created: true, ...result }
}

export async function getTransfers({ studentId } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM transfers WHERE 1=1'
  const params = []
  if (studentId) { sql += ' AND student_id=?'; params.push(studentId) }
  sql += ' ORDER BY datetime(created_at) DESC, id DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToTransfer)
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
      (id, student_id, student_name, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended, status, room, makeup_for)
      VALUES (@id, @student_id, @student_name, @course_id, @course_name, @teacher, @location, @date, @start_time, @end_time, @note, @color, @attended, @status, @room, @makeup_for)`)
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
        status: s.status || 'scheduled',
        room: s.room || '',
        makeup_for: s.makeupFor || '',
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

function insertSchedule(db, s, id) {
  db.prepare(`INSERT INTO schedules
    (id, student_id, student_name, course_id, course_name, teacher, location, date, start_time, end_time, note, color, attended, status, room, makeup_for)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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
    s.status || 'scheduled',
    s.room || '',
    s.makeupFor || '',
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
    db.prepare(`UPDATE schedules SET
      student_id=?, student_name=?, course_id=?, course_name=?, teacher=?, location=?, date=?, start_time=?, end_time=?, note=?, color=?, status=?, room=?, makeup_for=?
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
      newSchedule.status || 'scheduled',
      newSchedule.room || '',
      newSchedule.makeupFor || '',
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

// ========== 管理员账号（RBAC） ==========
export async function getAdmins() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM admins ORDER BY datetime(created_at), id').all()
  return rows.map(rowToAdmin)
}

export async function getAdminById(id) {
  const db = getDb()
  return rowToAdmin(db.prepare('SELECT * FROM admins WHERE id=?').get(id))
}

export async function getAdminByUsername(username) {
  const db = getDb()
  return db.prepare('SELECT * FROM admins WHERE username=?').get(username) || null
}

export async function countAdmins() {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS c FROM admins').get()
  return row?.c || 0
}

export async function countSuperAdmins() {
  const db = getDb()
  const row = db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role='superadmin' AND status='active'").get()
  return row?.c || 0
}

// 创建超管（bootstrap 用，固定 role=superadmin）
export async function createSuperAdmin(username, passwordHash) {
  const db = getDb()
  const id = genAdminId()
  db.prepare(`INSERT INTO admins (id, username, password_hash, role) VALUES (?, ?, ?, 'superadmin')`).run(id, username, passwordHash)
  return { id, username, role: 'superadmin' }
}

// 创建管理员（超管用，可选 role）
export async function createAdmin({ username, passwordHash, role, realName, phone, createdBy }) {
  const db = getDb()
  const id = genAdminId()
  db.prepare(`INSERT INTO admins (id, username, password_hash, role, real_name, phone, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, username, passwordHash, role || 'admin', realName || '', phone || '', createdBy || '',
  )
  return rowToAdmin(db.prepare('SELECT * FROM admins WHERE id=?').get(id))
}

export async function updateAdmin({ id, role, realName, phone, status, passwordHash }) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM admins WHERE id=?').get(id)
  if (!old) return { updated: false, notFound: true }
  const sets = []
  const params = []
  if (role !== undefined) { sets.push('role=?'); params.push(role) }
  if (realName !== undefined) { sets.push('real_name=?'); params.push(realName) }
  if (phone !== undefined) { sets.push('phone=?'); params.push(phone) }
  if (status !== undefined) { sets.push('status=?'); params.push(status) }
  if (passwordHash) { sets.push('password_hash=?'); params.push(passwordHash) }
  if (sets.length > 0) {
    params.push(id)
    db.prepare(`UPDATE admins SET ${sets.join(', ')} WHERE id=?`).run(...params)
  }
  return { updated: true, notFound: false }
}

export async function deleteAdmin(id) {
  const db = getDb()
  const info = db.prepare('DELETE FROM admins WHERE id=?').run(id)
  return { deleted: info.changes > 0 }
}

// 记录登录时间/IP
export async function recordLogin(id, ip) {
  const db = getDb()
  db.prepare('UPDATE admins SET last_login_at=?, last_login_ip=? WHERE id=?')
    .run(new Date().toISOString(), ip || '', id)
}

// 兼容旧调用：返回首个超管
export async function getSuperAdmin() {
  const db = getDb()
  const row = db.prepare("SELECT * FROM admins WHERE role='superadmin' LIMIT 1").get()
  return row || null
}

// ========== 审计日志 ==========
// 写入一条审计记录（before/after 为对象，内部 JSON 序列化）
export async function addAuditLog({
  actorId, actorName, actorRole, action, module,
  targetType = '', targetId = '', targetName = '', summary = '',
  before = null, after = null, ip = '', userAgent = '',
}) {
  const db = getDb()
  const id = genAuditId()
  db.prepare(`INSERT INTO audit_logs
    (id, actor_id, actor_name, actor_role, action, module, target_type, target_id, target_name, summary, before_json, after_json, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, actorId || '', actorName || '', actorRole || '',
    action, module, targetType, targetId, targetName, summary,
    before ? JSON.stringify(before) : '',
    after ? JSON.stringify(after) : '',
    ip, userAgent,
  )
  return id
}

// 查询审计日志（分页 + 多条件过滤）
export async function getAuditLogs({
  actorId, module, targetType, targetId, action,
  startDate, endDate, page = 1, pageSize = 20,
} = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM audit_logs WHERE 1=1'
  const params = []
  if (actorId) { sql += ' AND actor_id=?'; params.push(actorId) }
  if (module) { sql += ' AND module=?'; params.push(module) }
  if (targetType) { sql += ' AND target_type=?'; params.push(targetType) }
  if (targetId) { sql += ' AND target_id=?'; params.push(targetId) }
  if (action) { sql += ' AND action=?'; params.push(action) }
  if (startDate) { sql += ' AND created_at>=?'; params.push(startDate) }
  if (endDate) { sql += ' AND created_at<=?'; params.push(endDate + ' 23:59:59') }
  // 计数
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) AS c')
  const total = db.prepare(countSql).get(...params)?.c || 0
  // 分页
  sql += ' ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?'
  const rows = db.prepare(sql).all(...params, pageSize, (page - 1) * pageSize)
  return { logs: rows.map(rowToAuditLog), total, page, pageSize }
}

// ========== 报表 ==========
// 所有报表函数接收 { startDate, endDate, groupBy }（均可选），返回 { rows, summary }。
// groupBy 为空时整体汇总（单行 key='全部'）；日期过滤采用参数化查询防注入。

// 营收报表：已支付报名的营收/笔数/折扣，按 enrolled_at（空则 created_at 兜底）过滤
export async function getReportRevenue({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const dateCol = 'COALESCE(enrolled_at, created_at)'
  const where = ['paid_amount > 0']
  const params = []
  if (startDate) { where.push(`${dateCol} >= ?`); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push(`${dateCol} <= ?`); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  let join = ''
  if (groupBy === 'day') {
    selectKey = `substr(${dateCol}, 1, 10) AS key`
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = `substr(${dateCol}, 1, 7) AS key`
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'course') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = 'COALESCE(courses.name, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = 'COALESCE(courses.teacher, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COALESCE(SUM(paid_amount), 0) AS revenue,
      COUNT(*) AS count,
      COALESCE(SUM(discount_amount), 0) AS discount
    FROM enrollments ${join}
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    revenue: Number(r.revenue) || 0,
    count: Number(r.count) || 0,
    discount: Number(r.discount) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.revenue += r.revenue
    acc.count += r.count
    acc.discount += r.discount
    return acc
  }, { revenue: 0, count: 0, discount: 0 })
  return { rows, summary }
}

// 课时消耗报表：已到课（attended=1）的排课条数，按 date 过滤
export async function getReportHoursConsumption({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ['attended = 1']
  const params = []
  if (startDate) { where.push('date >= ?'); params.push(startDate) }
  if (endDate) { where.push('date <= ?'); params.push(endDate) }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  if (groupBy === 'day') {
    selectKey = 'substr(date, 1, 10) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = 'substr(date, 1, 7) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'course') {
    selectKey = 'COALESCE(course_name, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    selectKey = 'COALESCE(teacher, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COUNT(*) AS consumed
    FROM schedules
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    consumed: Number(r.consumed) || 0,
  }))
  const summary = { consumed: rows.reduce((s, r) => s + r.consumed, 0) }
  return { rows, summary }
}

// 课时余额报表：活跃报名的剩余与总课时，按 created_at 过滤（可选）
export async function getReportHoursBalance({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ["status = 'active'"]
  const params = []
  if (startDate) { where.push('created_at >= ?'); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push('created_at <= ?'); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  let join = ''
  if (groupBy === 'course') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = 'COALESCE(courses.name, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = 'COALESCE(courses.teacher, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COALESCE(SUM(COALESCE(remaining_paid_hours, 0) + COALESCE(remaining_gift_hours, 0)), 0) AS remaining,
      COALESCE(SUM(COALESCE(purchased_hours, 0) + COALESCE(gift_hours, 0)), 0) AS total
    FROM enrollments ${join}
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    remaining: Number(r.remaining) || 0,
    total: Number(r.total) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.remaining += r.remaining
    acc.total += r.total
    return acc
  }, { remaining: 0, total: 0 })
  return { rows, summary }
}

// 出勤率报表：到课/缺勤/总数与出勤率，按 date 过滤
export async function getReportAttendanceRate({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ['1=1']
  const params = []
  if (startDate) { where.push('date >= ?'); params.push(startDate) }
  if (endDate) { where.push('date <= ?'); params.push(endDate) }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  if (groupBy === 'day') {
    selectKey = 'substr(date, 1, 10) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = 'substr(date, 1, 7) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'course') {
    selectKey = 'COALESCE(course_name, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    selectKey = 'COALESCE(teacher, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COUNT(*) AS total,
      SUM(attended = 1) AS attended,
      SUM(attended = 0) AS absent
    FROM schedules
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => {
    const total = Number(r.total) || 0
    const attended = Number(r.attended) || 0
    const absent = Number(r.absent) || 0
    return {
      key: r.key == null ? '全部' : String(r.key),
      total,
      attended,
      absent,
      rate: total > 0 ? Math.round(attended / total * 1000) / 10 : 0,
    }
  })
  const summary = rows.reduce((acc, r) => {
    acc.total += r.total
    acc.attended += r.attended
    acc.absent += r.absent
    return acc
  }, { total: 0, attended: 0, absent: 0 })
  summary.rate = summary.total > 0 ? Math.round(summary.attended / summary.total * 1000) / 10 : 0
  return { rows, summary }
}

// 结转统计报表：转移金额/课时/笔数，按 created_at 过滤
export async function getReportTransfers({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ['1=1']
  const params = []
  if (startDate) { where.push('created_at >= ?'); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push('created_at <= ?'); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  if (groupBy === 'day') {
    selectKey = 'substr(created_at, 1, 10) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = 'substr(created_at, 1, 7) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COALESCE(SUM(transferred_amount), 0) AS amount,
      COALESCE(SUM(transferred_hours), 0) AS hours,
      COUNT(*) AS count
    FROM transfers
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    amount: Number(r.amount) || 0,
    hours: Number(r.hours) || 0,
    count: Number(r.count) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.amount += r.amount
    acc.hours += r.hours
    acc.count += r.count
    return acc
  }, { amount: 0, hours: 0, count: 0 })
  return { rows, summary }
}

// 报名统计报表：报名笔数与金额，按 enrolled_at（空则 created_at 兜底）过滤
export async function getReportEnrollmentStats({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const dateCol = 'COALESCE(enrolled_at, created_at)'
  const where = ['1=1']
  const params = []
  if (startDate) { where.push(`${dateCol} >= ?`); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push(`${dateCol} <= ?`); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  let join = ''
  if (groupBy === 'course') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = 'COALESCE(courses.name, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'channel') {
    selectKey = 'COALESCE(channel, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'status') {
    selectKey = 'COALESCE(status, "") AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COUNT(*) AS count,
      COALESCE(SUM(total_amount), 0) AS amount
    FROM enrollments ${join}
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    count: Number(r.count) || 0,
    amount: Number(r.amount) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.count += r.count
    acc.amount += r.amount
    return acc
  }, { count: 0, amount: 0 })
  return { rows, summary }
}

// ========== 数据备份与恢复 ==========
import {
  copyFileSync, existsSync, mkdirSync as mkdirSyncFs,
  readFileSync, readdirSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs'

// 备份目录
const BACKUP_DIR = join(DATA_DIR, 'backups')

function ensureBackupDir() {
  mkdirSyncFs(BACKUP_DIR, { recursive: true })
}

// 创建一份备份（VACUUM INTO 生成独立可用的 db 副本）
// 返回 { ok, filename, path, size, createdAt }
export function createBackup() {
  ensureBackupDir()
  const now = new Date()
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `backup-${ts}.db`
  const path = join(BACKUP_DIR, filename)
  const db = getDb()
  // VACUUM INTO 在事务内生成干净副本，不锁住主库的读
  db.pragma('wal_checkpoint(FULL)')
  db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
  const size = statSync(path).size
  return { ok: true, filename, path, size, createdAt: now.toISOString() }
}

// 列出所有备份（按时间倒序）
export function listBackups() {
  ensureBackupDir()
  const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db'))
  const list = files.map((f) => {
    const p = join(BACKUP_DIR, f)
    const st = statSync(p)
    return { filename: f, path: p, size: st.size, createdAt: st.mtime.toISOString() }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return list
}

// 删除指定备份
export function deleteBackup(filename) {
  if (typeof filename !== 'string' || !/^backup-[\dT-]+\.db$/.test(filename)) {
    throw new Error('非法的备份文件名')
  }
  const path = join(BACKUP_DIR, filename)
  if (!existsSync(path)) throw new Error('备份文件不存在')
  unlinkSync(path)
  return { ok: true }
}

// 清理过期备份：删除早于 keepDays 天的备份
export function purgeOldBackups(keepDays) {
  ensureBackupDir()
  const days = Math.max(1, Math.floor(Number(keepDays) || 30))
  const cutoff = Date.now() - days * 86400000
  const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db'))
  let deleted = 0
  for (const f of files) {
    const p = join(BACKUP_DIR, f)
    try {
      const st = statSync(p)
      if (st.mtimeMs < cutoff) {
        unlinkSync(p)
        deleted++
      }
    } catch {
      // 忽略单个文件错误
    }
  }
  return { deleted }
}

// 从指定备份文件恢复：覆盖当前主库
// 恢复前自动创建一份「恢复前快照」防止误操作
export function restoreBackup(filename) {
  if (typeof filename !== 'string' || !/^backup-[\dT-]+\.db$/.test(filename)) {
    throw new Error('非法的备份文件名')
  }
  const src = join(BACKUP_DIR, filename)
  if (!existsSync(src)) throw new Error('备份文件不存在')
  // 恢复前快照
  const preSnapshot = createBackup()
  // 关闭当前连接，覆盖文件
  if (dbInstance) {
    try { dbInstance.close() } catch { /* 忽略 */ }
    dbInstance = null
  }
  // WAL 模式下需同时清理 -wal/-shm
  for (const suffix of ['', '-wal', '-shm']) {
    try { unlinkSync(DB_PATH + suffix) } catch { /* 忽略 */ }
  }
  copyFileSync(src, DB_PATH)
  // 重新打开并校验
  const db = getDb()
  const valid = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='students'").get()
  if (!valid) throw new Error('备份文件无效：缺少 students 表')
  return { ok: true, preSnapshot: preSnapshot.filename }
}

// ========== 课时有效期处理 ==========
// 扫描已过期且仍 active 的报名记录，置为 expired 状态
// 返回 { affected }
export function expireOverdueEnrollments() {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const info = db.prepare(
    `UPDATE enrollments
       SET status='expired'
     WHERE status='active'
       AND expired_at <> ''
       AND expired_at < ?`,
  ).run(today)
  return { affected: info.changes || 0 }
}

// ========== 批量报名 ==========
// 批量为多个学员报名同一课程
// items: [{ studentId, purchasedHours, giftHours, unitPrice, paidAmount }]
export async function batchAddEnrollments(courseId, items, operatorId) {
  if (!courseId) throw new Error('缺少 courseId')
  if (!Array.isArray(items) || items.length === 0) throw new Error('报名条目不能为空')
  const db = getDb()
  const results = []
  const enroll = db.transaction(() => {
    for (const it of items) {
      const id = genEnrollmentId()
      const ph = Math.max(0, Math.floor(Number(it.purchasedHours) || 0))
      const gh = Math.max(0, Math.floor(Number(it.giftHours) || 0))
      const up = Math.max(0, Number(it.unitPrice) || 0)
      const paid = Math.max(0, Number(it.paidAmount) || 0)
      const total = ph * up
      db.prepare(`INSERT INTO enrollments
        (id, student_id, course_id, status, purchased_hours, gift_hours,
         remaining_paid_hours, remaining_gift_hours, unit_price, total_amount,
         paid_amount, discount_amount, payment_status, operator_id, enrolled_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
        .run(id, it.studentId, courseId, 'active', ph, gh, ph, gh, up, total, paid, 0, 'paid', operatorId || '')
      results.push({ studentId: it.studentId, enrollmentId: id, ok: true })
    }
  })
  enroll()
  return { results, count: results.length }
}

// ========== 通用数据导出（CSV 用） ==========
// 导出学员列表（含报名汇总）
export function exportStudentsWithSummary() {
  const db = getDb()
  const rows = db.prepare(`
    SELECT s.id, s.name, s.grade, s.phone, s.parent_name, s.gender,
           s.birthday, s.status, s.tags, s.source, s.created_at,
           (SELECT COUNT(*) FROM enrollments e WHERE e.student_id=s.id) AS enrollment_count,
           (SELECT COALESCE(SUM(e.remaining_paid_hours + e.remaining_gift_hours),0)
              FROM enrollments e WHERE e.student_id=s.id AND e.status='active') AS remaining_hours
    FROM students s
    ORDER BY s.created_at DESC
  `).all()
  return rows
}

// 导出报名记录
export function exportEnrollments() {
  const db = getDb()
  const rows = db.prepare(`
    SELECT e.id, e.student_id, s.name AS student_name, e.course_id, c.name AS course_name,
           e.status, e.purchased_hours, e.gift_hours, e.remaining_paid_hours,
           e.remaining_gift_hours, e.unit_price, e.total_amount, e.paid_amount,
           e.payment_status, e.expired_at, e.enrolled_at
    FROM enrollments e
    LEFT JOIN students s ON s.id=e.student_id
    LEFT JOIN courses c ON c.id=e.course_id
    ORDER BY e.enrolled_at DESC
  `).all()
  return rows
}

// ========== 课后反馈 feedback ==========
export async function getFeedback({ scheduleId, teacherId, studentId, courseId } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM feedback WHERE 1=1'
  const params = []
  if (scheduleId) { sql += ' AND schedule_id=?'; params.push(scheduleId) }
  if (teacherId) { sql += ' AND teacher_id=?'; params.push(teacherId) }
  if (studentId) { sql += ' AND student_id=?'; params.push(studentId) }
  if (courseId) { sql += ' AND course_id=?'; params.push(courseId) }
  sql += ' ORDER BY created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, scheduleId: r.schedule_id, courseId: r.course_id,
    teacherId: r.teacher_id, teacherName: r.teacher_name,
    studentId: r.student_id, studentName: r.student_name,
    date: r.date, content: r.content, rating: r.rating,
    createdAt: r.created_at,
  }))
}

export async function addFeedback(fb) {
  const db = getDb()
  const id = genFeedbackId()
  db.prepare(`INSERT INTO feedback
    (id, schedule_id, course_id, teacher_id, teacher_name, student_id, student_name, date, content, rating)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, fb.scheduleId || '', fb.courseId || '', fb.teacherId || '', fb.teacherName || '',
    fb.studentId || '', fb.studentName || '', fb.date || '', fb.content || '', Math.max(0, Math.min(5, Math.floor(Number(fb.rating) || 0))),
  )
  return { id, feedback: { ...fb, id } }
}

export async function updateFeedback(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM feedback WHERE id=?').get(id)
  if (!old) throw new Error('反馈记录不存在')
  const next = {
    content: patch.content !== undefined ? patch.content : old.content,
    rating: patch.rating !== undefined ? Math.max(0, Math.min(5, Math.floor(Number(patch.rating) || 0))) : old.rating,
  }
  db.prepare('UPDATE feedback SET content=?, rating=? WHERE id=?').run(next.content, next.rating, id)
  return { id }
}

export async function deleteFeedback(id) {
  const db = getDb()
  db.prepare('DELETE FROM feedback WHERE id=?').run(id)
  return { ok: true }
}

// 教师绩效统计：按教师聚合课时数与平均评分
export function getTeacherPerformance({ startDate, endDate } = {}) {
  const db = getDb()
  const params = []
  let dateFilter = ''
  if (startDate) { dateFilter += ' AND s.date >= ?'; params.push(startDate) }
  if (endDate) { dateFilter += ' AND s.date <= ?'; params.push(endDate) }
  // 课时统计（到课=1节）来自 schedules 点名，评分来自 feedback
  const rows = db.prepare(`
    SELECT c.teacher AS teacher_id, c.teacher AS teacher_name,
      COUNT(DISTINCT s.id) AS schedule_count,
      SUM(CASE WHEN s.attended=1 THEN 1 ELSE 0 END) AS attended_count,
      (SELECT AVG(f.rating) FROM feedback f WHERE f.teacher_id=c.teacher ${startDate ? 'AND f.date >= ?' : ''} ${endDate ? 'AND f.date <= ?' : ''}) AS avg_rating,
      (SELECT COUNT(*) FROM feedback f WHERE f.teacher_id=c.teacher ${startDate ? 'AND f.date >= ?' : ''} ${endDate ? 'AND f.date <= ?' : ''}) AS feedback_count
    FROM courses c
    LEFT JOIN schedules s ON s.course_id=c.id ${dateFilter.replace('s.date', 's.date')}
    WHERE c.teacher <> ''
    GROUP BY c.teacher
    ORDER BY attended_count DESC
  `).all(...params, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : []), ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : []))
  return rows
}

// ========== 优惠券 coupons ==========
export async function getCoupons({ status } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM coupons WHERE 1=1'
  const params = []
  if (status) { sql += ' AND status=?'; params.push(status) }
  sql += ' ORDER BY created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, type: r.type, value: r.value,
    minAmount: r.min_amount, validFrom: r.valid_from, validTo: r.valid_to,
    usageLimit: r.usage_limit, usedCount: r.used_count, status: r.status,
    remark: r.remark, createdAt: r.created_at,
  }))
}

export async function addCoupon(coupon) {
  const db = getDb()
  const id = genCouponId()
  db.prepare(`INSERT INTO coupons
    (id, code, name, type, value, min_amount, valid_from, valid_to, usage_limit, used_count, status, remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, coupon.code || id, coupon.name || '', coupon.type || 'discount',
    Math.max(0, Number(coupon.value) || 0), Math.max(0, Number(coupon.minAmount) || 0),
    coupon.validFrom || '', coupon.validTo || '',
    Math.max(0, Math.floor(Number(coupon.usageLimit) || 0)), 0,
    coupon.status || 'active', coupon.remark || '',
  )
  return { id, coupon: { ...coupon, id } }
}

export async function updateCoupon(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM coupons WHERE id=?').get(id)
  if (!old) throw new Error('优惠券不存在')
  db.prepare(`UPDATE coupons SET name=?, type=?, value=?, min_amount=?, valid_from=?, valid_to=?, usage_limit=?, status=?, remark=? WHERE id=?`).run(
    patch.name !== undefined ? patch.name : old.name,
    patch.type !== undefined ? patch.type : old.type,
    patch.value !== undefined ? Math.max(0, Number(patch.value) || 0) : old.value,
    patch.minAmount !== undefined ? Math.max(0, Number(patch.minAmount) || 0) : old.min_amount,
    patch.validFrom !== undefined ? patch.validFrom : old.valid_from,
    patch.validTo !== undefined ? patch.validTo : old.valid_to,
    patch.usageLimit !== undefined ? Math.max(0, Math.floor(Number(patch.usageLimit) || 0)) : old.usage_limit,
    patch.status !== undefined ? patch.status : old.status,
    patch.remark !== undefined ? patch.remark : old.remark,
    id,
  )
  return { id }
}

export async function deleteCoupon(id) {
  const db = getDb()
  db.prepare('DELETE FROM coupons WHERE id=?').run(id)
  return { ok: true }
}

// ========== 会员卡 memberships ==========
export async function getMemberships({ status } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM memberships WHERE 1=1'
  const params = []
  if (status) { sql += ' AND status=?'; params.push(status) }
  sql += ' ORDER BY created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, name: r.name, type: r.type, durationDays: r.duration_days,
    price: r.price, status: r.status, benefits: r.benefits,
    remark: r.remark, createdAt: r.created_at,
  }))
}

export async function addMembership(m) {
  const db = getDb()
  const id = genMembershipId()
  db.prepare(`INSERT INTO memberships (id, name, type, duration_days, price, status, benefits, remark) VALUES (?,?,?,?,?,?,?,?)`).run(
    id, m.name || '', m.type || 'monthly', Math.max(1, Math.floor(Number(m.durationDays) || 30)),
    Math.max(0, Number(m.price) || 0), m.status || 'active', m.benefits || '', m.remark || '',
  )
  return { id, membership: { ...m, id } }
}

export async function updateMembership(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM memberships WHERE id=?').get(id)
  if (!old) throw new Error('会员卡不存在')
  db.prepare(`UPDATE memberships SET name=?, type=?, duration_days=?, price=?, status=?, benefits=?, remark=? WHERE id=?`).run(
    patch.name !== undefined ? patch.name : old.name,
    patch.type !== undefined ? patch.type : old.type,
    patch.durationDays !== undefined ? Math.max(1, Math.floor(Number(patch.durationDays) || 30)) : old.duration_days,
    patch.price !== undefined ? Math.max(0, Number(patch.price) || 0) : old.price,
    patch.status !== undefined ? patch.status : old.status,
    patch.benefits !== undefined ? patch.benefits : old.benefits,
    patch.remark !== undefined ? patch.remark : old.remark,
    id,
  )
  return { id }
}

export async function deleteMembership(id) {
  const db = getDb()
  db.prepare('DELETE FROM memberships WHERE id=?').run(id)
  return { ok: true }
}

// 学员会员卡
export async function getStudentMemberships({ studentId, status } = {}) {
  const db = getDb()
  let sql = `SELECT sm.*, m.name AS membership_name, m.type AS membership_type, m.duration_days,
             s.name AS student_name
             FROM student_memberships sm
             LEFT JOIN memberships m ON m.id=sm.membership_id
             LEFT JOIN students s ON s.id=sm.student_id WHERE 1=1`
  const params = []
  if (studentId) { sql += ' AND sm.student_id=?'; params.push(studentId) }
  if (status) { sql += ' AND sm.status=?'; params.push(status) }
  sql += ' ORDER BY sm.created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, studentId: r.student_id, studentName: r.student_name,
    membershipId: r.membership_id, membershipName: r.membership_name,
    membershipType: r.membership_type, status: r.status,
    startedAt: r.started_at, expiredAt: r.expired_at,
    paidAmount: r.paid_amount, createdAt: r.created_at,
  }))
}

export async function addStudentMembership(sm) {
  const db = getDb()
  const id = genStudentMembershipId()
  const startedAt = sm.startedAt || new Date().toISOString().slice(0, 10)
  // 计算到期日
  let expiredAt = sm.expiredAt || ''
  if (!expiredAt && sm.durationDays) {
    const d = new Date(startedAt)
    d.setDate(d.getDate() + Math.max(1, Math.floor(Number(sm.durationDays) || 30)))
    expiredAt = d.toISOString().slice(0, 10)
  }
  db.prepare(`INSERT INTO student_memberships (id, student_id, membership_id, status, started_at, expired_at, paid_amount, operator_id) VALUES (?,?,?,?,?,?,?,?)`).run(
    id, sm.studentId, sm.membershipId, sm.status || 'active', startedAt, expiredAt,
    Math.max(0, Number(sm.paidAmount) || 0), sm.operatorId || '',
  )
  return { id }
}

export async function deleteStudentMembership(id) {
  const db = getDb()
  db.prepare('DELETE FROM student_memberships WHERE id=?').run(id)
  return { ok: true }
}

// ========== CRM 线索 leads ==========
export async function getLeads({ stage, assignedTo } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM leads WHERE 1=1'
  const params = []
  if (stage) { sql += ' AND stage=?'; params.push(stage) }
  if (assignedTo) { sql += ' AND assigned_to=?'; params.push(assignedTo) }
  sql += ' ORDER BY updated_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, name: r.name, phone: r.phone, grade: r.grade, source: r.source,
    stage: r.stage, intention: r.intention, assignedTo: r.assigned_to,
    remark: r.remark, converted: !!r.converted, studentId: r.student_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }))
}

export async function addLead(lead) {
  const db = getDb()
  const id = genLeadId()
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO leads (id, name, phone, grade, source, stage, intention, assigned_to, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, lead.name || '', lead.phone || '', lead.grade || '', lead.source || '',
    lead.stage || 'new', lead.intention || '', lead.assignedTo || '', lead.remark || '', now, now,
  )
  return { id, lead: { ...lead, id } }
}

export async function updateLead(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM leads WHERE id=?').get(id)
  if (!old) throw new Error('线索不存在')
  const now = new Date().toISOString()
  db.prepare(`UPDATE leads SET name=?, phone=?, grade=?, source=?, stage=?, intention=?, assigned_to=?, remark=?, converted=?, student_id=?, updated_at=? WHERE id=?`).run(
    patch.name !== undefined ? patch.name : old.name,
    patch.phone !== undefined ? patch.phone : old.phone,
    patch.grade !== undefined ? patch.grade : old.grade,
    patch.source !== undefined ? patch.source : old.source,
    patch.stage !== undefined ? patch.stage : old.stage,
    patch.intention !== undefined ? patch.intention : old.intention,
    patch.assignedTo !== undefined ? patch.assignedTo : old.assigned_to,
    patch.remark !== undefined ? patch.remark : old.remark,
    patch.converted !== undefined ? (patch.converted ? 1 : 0) : old.converted,
    patch.studentId !== undefined ? patch.studentId : old.student_id,
    now, id,
  )
  return { id }
}

export async function deleteLead(id) {
  const db = getDb()
  db.prepare('DELETE FROM leads WHERE id=?').run(id)
  db.prepare('DELETE FROM lead_followups WHERE lead_id=?').run(id)
  return { ok: true }
}

// 线索跟进记录
export async function getFollowups(leadId) {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM lead_followups WHERE lead_id=? ORDER BY created_at DESC').all(leadId)
  return rows.map((r) => ({
    id: r.id, leadId: r.lead_id, content: r.content, stage: r.stage,
    operatorId: r.operator_id, createdAt: r.created_at,
  }))
}

export async function addFollowup(fu) {
  const db = getDb()
  const id = genFollowupId()
  db.prepare(`INSERT INTO lead_followups (id, lead_id, content, stage, operator_id) VALUES (?,?,?,?,?)`).run(
    id, fu.leadId, fu.content || '', fu.stage || '', fu.operatorId || '',
  )
  // 同步更新线索的 updated_at
  db.prepare('UPDATE leads SET updated_at=? WHERE id=?').run(new Date().toISOString(), fu.leadId)
  return { id }
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
