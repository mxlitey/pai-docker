import { STORE_DB_PATH, STORE_DATA_DIR, getDb, closeDbInstance } from './core.js'
import {
  copyFileSync, existsSync, mkdirSync as mkdirSyncFs,
  readdirSync, statSync, unlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { now, formatInShanghai } from '../time.js'

// ========== 数据备份与恢复 ==========

// 备份目录
const BACKUP_DIR = join(STORE_DATA_DIR, 'backups')

function ensureBackupDir() {
  mkdirSyncFs(BACKUP_DIR, { recursive: true })
}

// 创建一份备份（VACUUM INTO 生成独立可用的 db 副本）
// 返回 { ok, filename, path, size, createdAt }
// 文件名与 createdAt 均使用项目时区（Asia/Shanghai），
// 便于与"凌晨 3 点备份"等本地时间计划对齐
export function createBackup() {
  ensureBackupDir()
  const ts = now().replace(' ', '_').replace(/:/g, '-')
  const filename = `backup-${ts}.db`
  const path = join(BACKUP_DIR, filename)
  const db = getDb()
  // VACUUM INTO 在事务内生成干净副本，不锁住主库的读
  db.pragma('wal_checkpoint(FULL)')
  db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
  const size = statSync(path).size
  return { ok: true, filename, path, size, createdAt: now() }
}

// 列出所有备份（按时间倒序）
export function listBackups() {
  ensureBackupDir()
  const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db'))
  const list = files.map((f) => {
    const p = join(BACKUP_DIR, f)
    const st = statSync(p)
    // 文件 mtime 用项目时区（Asia/Shanghai）字符串返回，与备份计划时区一致
    return { filename: f, path: p, size: st.size, createdAt: formatInShanghai(st.mtime) }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return list
}

// 删除指定备份
export function deleteBackup(filename) {
  if (typeof filename !== 'string' || !/^backup-[\d_T-]+\.db$/.test(filename)) {
    throw new Error('非法的备份文件名')
  }
  const path = join(BACKUP_DIR, filename)
  if (!existsSync(path)) throw new Error('备份文件不存在')
  unlinkSync(path)
  return { ok: true }
}

// 清理过期备份：先按 keepDays 删除过期，再按 maxCount 删除最旧超出份数的
// maxCount 为可选，传入时按总数裁剪到该份数以内（分钟级备份时防止磁盘撑爆）
export function purgeOldBackups(keepDays, maxCount) {
  ensureBackupDir()
  const days = Math.max(1, Math.floor(Number(keepDays) || 30))
  const cutoff = Date.now() - days * 86400000
  let deleted = 0
  // 第一步：按天数删除过期
  const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db'))
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
  // 第二步：按最大份数裁剪（删除最旧的超出部分）
  const maxN = Math.max(1, Math.floor(Number(maxCount) || 0))
  if (maxN > 0) {
    const remaining = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const p = join(BACKUP_DIR, f)
        try { return { name: f, mtime: statSync(p).mtimeMs } } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime) // 新→旧
    if (remaining.length > maxN) {
      for (const item of remaining.slice(maxN)) {
        try { unlinkSync(join(BACKUP_DIR, item.name)); deleted++ } catch { /* 忽略 */ }
      }
    }
  }
  return { deleted }
}

// 从指定备份文件恢复：覆盖当前主库
// 恢复前自动创建一份「恢复前快照」防止误操作
export function restoreBackup(filename) {
  if (typeof filename !== 'string' || !/^backup-[\d_T-]+\.db$/.test(filename)) {
    throw new Error('非法的备份文件名')
  }
  const src = join(BACKUP_DIR, filename)
  if (!existsSync(src)) throw new Error('备份文件不存在')
  // 恢复前快照
  const preSnapshot = createBackup()
  // 关闭当前连接，覆盖文件
  closeDbInstance()
  // WAL 模式下需同时清理 -wal/-shm
  for (const suffix of ['', '-wal', '-shm']) {
    try { unlinkSync(STORE_DB_PATH + suffix) } catch { /* 忽略 */ }
  }
  copyFileSync(src, STORE_DB_PATH)
  // 重新打开并校验
  const db = getDb()
  const valid = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='students'").get()
  if (!valid) throw new Error('备份文件无效：缺少 students 表')
  return { ok: true, preSnapshot: preSnapshot.filename }
}
