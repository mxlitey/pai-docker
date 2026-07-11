// 审计日志归档：按月将 audit_logs 表数据导出为 JSON+gzip 压缩文件，
// 归档后清理原表对应月份记录，降低主库体积、保留历史可追溯。
import { STORE_DATA_DIR, getDb, validateMonth } from './core.js'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { formatInShanghai } from '../time.js'

// 归档目录：data/audit_archive/
const ARCHIVE_DIR = join(STORE_DATA_DIR, 'audit_archive')

function ensureArchiveDir() {
  mkdirSync(ARCHIVE_DIR, { recursive: true })
}

// 行 -> 对象（与 store/audit.js 的 rowToAuditLog 保持一致，归档内容沿用 camelCase 形态）
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

// 计算下一个月的 'YYYY-MM'（用于构造 created_at 上界）
function nextMonthOf(month) {
  const [y, m] = month.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

// 归档指定月份的审计日志（格式 'YYYY-MM'）
// 流程（事务内）：查询该月全部日志 → gzip 压缩写文件 → 删除原表记录
// 返回 { archived, filename, size }
export function archiveAuditLogs(month) {
  validateMonth(month, 'month')
  ensureArchiveDir()
  const filename = `audit-${month}.json.gz`
  const path = join(ARCHIVE_DIR, filename)
  const db = getDb()

  const start = `${month}-01 00:00:00`
  const end = `${nextMonthOf(month)}-01 00:00:00`

  const doArchive = db.transaction(() => {
    // 查询该月所有审计日志（created_at 为 'YYYY-MM-DD HH:MM:SS'，可按字典序比较）
    const rows = db.prepare(
      `SELECT * FROM audit_logs WHERE created_at >= ? AND created_at < ? ORDER BY datetime(created_at), id`,
    ).all(start, end)
    const logs = rows.map(rowToAuditLog)

    // 压缩为 JSON+gzip（文件已存在则覆盖）
    const jsonStr = JSON.stringify({ month, count: logs.length, exportedAt: formatInShanghai(new Date()), logs })
    const gz = gzipSync(jsonStr)
    writeFileSync(path, gz)

    // 删除原表该月记录
    db.prepare(`DELETE FROM audit_logs WHERE created_at >= ? AND created_at < ?`).run(start, end)

    return { archived: logs.length, filename, size: gz.length }
  })

  return doArchive()
}

// 列出所有归档文件（按月份倒序）
// 返回 [{ month, filename, size, count, createdAt }]
// count 为归档内的日志条数（best-effort：读取失败时为 0）
export function listAuditArchives() {
  ensureArchiveDir()
  const files = readdirSync(ARCHIVE_DIR).filter((f) => /^audit-\d{4}-\d{2}\.json\.gz$/.test(f))
  const list = files.map((f) => {
    const p = join(ARCHIVE_DIR, f)
    const st = statSync(p)
    const month = f.replace(/^audit-/, '').replace(/\.json\.gz$/, '')
    // 读取归档内的日志条数（解压后取 count 字段，失败则记 0）
    let count = 0
    try {
      const jsonStr = gunzipSync(readFileSync(p)).toString('utf-8')
      const data = JSON.parse(jsonStr)
      count = Array.isArray(data) ? data.length : (typeof data.count === 'number' ? data.count : (Array.isArray(data.logs) ? data.logs.length : 0))
    } catch {
      // 单个文件损坏不影响整体列表
    }
    return { month, filename: f, size: st.size, count, createdAt: formatInShanghai(st.mtime) }
  }).sort((a, b) => b.month.localeCompare(a.month))
  return list
}

// 读取指定月份的归档内容
// 返回 { month, logs: [...], count }
export function readAuditArchive(month) {
  validateMonth(month, 'month')
  const filename = `audit-${month}.json.gz`
  const path = join(ARCHIVE_DIR, filename)
  if (!existsSync(path)) throw new Error(`归档文件不存在：${filename}`)
  let data
  try {
    const gz = readFileSync(path)
    const jsonStr = gunzipSync(gz).toString('utf-8')
    data = JSON.parse(jsonStr)
  } catch (e) {
    throw new Error(`归档文件读取或解压失败：${e?.message || String(e)}`)
  }
  // 兼容两种归档结构：{ month, count, logs } 或裸数组
  const logs = Array.isArray(data) ? data : (Array.isArray(data.logs) ? data.logs : [])
  const count = Array.isArray(data) ? data.length : (typeof data.count === 'number' ? data.count : logs.length)
  return { month, logs, count }
}

// 删除指定月份的归档文件
// 返回 { deleted: true }
export function deleteAuditArchive(month) {
  validateMonth(month, 'month')
  const filename = `audit-${month}.json.gz`
  const path = join(ARCHIVE_DIR, filename)
  if (!existsSync(path)) throw new Error(`归档文件不存在：${filename}`)
  unlinkSync(path)
  return { deleted: true }
}
