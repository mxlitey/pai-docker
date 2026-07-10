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
import { genAdminId } from '../id.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 数据目录：优先环境变量，否则项目根 data/
// 注意：本文件位于 node-functions/_lib/store/ 下，比原 store.js 深一层，
// 因此相对路径多上一个 '..'，以指向同一个项目根 data/ 目录（保持 DB 路径不变）。
const DATA_DIR = process.env.DATA_DIR
  || join(__dirname, '..', '..', '..', 'data')
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
      grade              TEXT DEFAULT '',
      description        TEXT DEFAULT '',
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grades (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      sort_order  INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'active',
      description TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_grades_sort ON grades(sort_order);

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
      permissions   TEXT DEFAULT '',
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
    ['grade', "TEXT DEFAULT ''"],
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
  // admins 补齐 permissions 列（细粒度权限点）
  ensureColumn(db, 'admins', 'permissions', "TEXT DEFAULT ''")

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
export function validateStorageId(id, name = 'id') {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error(`${name} 含非法字符（仅允许字母、数字、下划线、短横线，长度 1-64）`)
  }
}
export function validateMonth(month, name = 'month') {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`${name} 格式应为 yyyy-MM`)
  }
}
export function validateDate(date, name = 'date') {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${name} 格式应为 yyyy-MM-dd`)
  }
}

// 关闭并重置数据库单例（恢复备份前调用）。
// 说明：原 restoreBackup 内联了这段逻辑，但因 dbInstance 为本模块私有变量，
// 且 ESM 导入的绑定在导入方只读、不可赋值，故将「关闭+置空」逻辑上移到 core.js，
// 由 backups.js 的 restoreBackup 调用，行为与原实现完全一致。
export function closeDbInstance() {
  if (dbInstance) {
    try { dbInstance.close() } catch { /* 忽略 */ }
    dbInstance = null
  }
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
