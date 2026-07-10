// 配置文件管理 —— 高频读取的系统配置走文件，不占 DB
//
// 存储内容：
//   appName         - 项目名称（后台可动态修改）
//   tokenSecret     - token 签名密钥（首次启动自动生成 32 字节随机值）
//   renewalThreshold- 续费预警阈值（剩余课时 ≤ 此值标红，默认 4）
//   backupKeepDays  - 自动备份保留天数（默认 30）
//   backupInterval  - 自动备份频率（默认 'daily'）：支持分钟/小时/天级别
//   backupMaxCount  - 自动备份最大保留份数（默认 500，防止分钟级备份撑爆磁盘）
//   moduleEnabled   - 模块启用开关（id -> boolean，留作模块化扩展）
//
// 文件位置：DATA_DIR/config.json（与 SQLite 同目录，跟随数据卷持久化）
// 读取策略：启动时一次性加载到内存，读操作零 IO；写操作同步回写文件
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 配置文件目录：优先环境变量，否则项目根 data/
const CONFIG_DIR = process.env.DATA_DIR
  || join(__dirname, '..', '..', 'data')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

// 默认项目名称
const DEFAULT_APP_NAME = '排课系统'

// 内存缓存：启动后所有读操作直接走内存
let cachedConfig = null

// 生成 32 字节随机十六进制字符串作为 token 签名密钥
function generateTokenSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

// 默认续费预警阈值：剩余课时 ≤ 此值标红提醒
const DEFAULT_RENEWAL_THRESHOLD = 4
// 默认自动备份保留天数
const DEFAULT_BACKUP_KEEP_DAYS = 30
// 默认自动备份频率：每天凌晨 3:00 一次
const DEFAULT_BACKUP_INTERVAL = 'daily'
// 默认自动备份最大保留份数：分钟级备份时防止磁盘撑爆
const DEFAULT_BACKUP_MAX_COUNT = 500

// 合法的自动备份频率枚举及其毫秒间隔
// daily 特殊处理：锚定凌晨 3:00 执行；其余按固定间隔从启动起循环
export const BACKUP_INTERVALS = {
  'every-1m': 60 * 1000,
  'every-5m': 5 * 60 * 1000,
  'every-15m': 15 * 60 * 1000,
  'every-30m': 30 * 60 * 1000,
  'hourly': 60 * 60 * 1000,
  'every-6h': 6 * 60 * 60 * 1000,
  'every-12h': 12 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
}

// 校验备份频率合法性，非法值回退为默认
function normalizeBackupInterval(val) {
  return typeof val === 'string' && Object.prototype.hasOwnProperty.call(BACKUP_INTERVALS, val)
    ? val
    : DEFAULT_BACKUP_INTERVAL
}

// 构造默认配置（首次启动用）
function createDefaultConfig() {
  return {
    appName: DEFAULT_APP_NAME,
    tokenSecret: generateTokenSecret(),
    renewalThreshold: DEFAULT_RENEWAL_THRESHOLD,
    backupKeepDays: DEFAULT_BACKUP_KEEP_DAYS,
    backupInterval: DEFAULT_BACKUP_INTERVAL,
    backupMaxCount: DEFAULT_BACKUP_MAX_COUNT,
    moduleEnabled: {},
  }
}

// 启动时加载配置：文件不存在则生成默认配置并持久化
export function loadConfig() {
  if (cachedConfig) return cachedConfig
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      // 兼容性校验：确保必要字段存在
      cachedConfig = {
        appName: typeof parsed.appName === 'string' && parsed.appName.trim()
          ? parsed.appName
          : DEFAULT_APP_NAME,
        tokenSecret: typeof parsed.tokenSecret === 'string' && parsed.tokenSecret
          ? parsed.tokenSecret
          : generateTokenSecret(),
        renewalThreshold: Number.isFinite(parsed.renewalThreshold)
          ? Math.max(0, Math.floor(parsed.renewalThreshold))
          : DEFAULT_RENEWAL_THRESHOLD,
        backupKeepDays: Number.isFinite(parsed.backupKeepDays)
          ? Math.max(1, Math.floor(parsed.backupKeepDays))
          : DEFAULT_BACKUP_KEEP_DAYS,
        backupInterval: normalizeBackupInterval(parsed.backupInterval),
        backupMaxCount: Number.isFinite(parsed.backupMaxCount)
          ? Math.max(1, Math.floor(parsed.backupMaxCount))
          : DEFAULT_BACKUP_MAX_COUNT,
        moduleEnabled: parsed.moduleEnabled && typeof parsed.moduleEnabled === 'object'
          ? parsed.moduleEnabled
          : {},
      }
      // 若文件缺失必要字段，回写修复后的配置
      if (!parsed.tokenSecret || !parsed.appName || parsed.renewalThreshold === undefined) {
        writeFileSync(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2), 'utf-8')
      }
    } else {
      // 首次启动：生成默认配置
      cachedConfig = createDefaultConfig()
      writeFileSync(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2), 'utf-8')
    }
  } catch (e) {
    // 文件损坏等异常：兜底用内存默认配置，但不回写（避免覆盖损坏前的数据）
    console.error('[config] 加载配置文件失败，使用默认值:', e?.message || String(e))
    cachedConfig = createDefaultConfig()
  }
  return cachedConfig
}

// 同步回写配置到文件
function persist() {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2), 'utf-8')
  } catch (e) {
    console.error('[config] 回写配置文件失败:', e?.message || String(e))
    throw new Error('配置文件写入失败')
  }
}

// 读取项目名称
export function getAppName() {
  const cfg = loadConfig()
  return cfg.appName
}

// 修改项目名称：更新内存并回写文件
export function setAppName(name) {
  const cfg = loadConfig()
  const value = String(name || '').trim().slice(0, 50) || DEFAULT_APP_NAME
  cfg.appName = value
  persist()
  return value
}

// 读取 token 签名密钥
export function getTokenSecret() {
  const cfg = loadConfig()
  return cfg.tokenSecret
}

// 暴露配置文件路径（供调试/运维查看）
export function getConfigPath() {
  return CONFIG_PATH
}

// 暴露配置文件目录（供备份模块使用）
export function getConfigDir() {
  return CONFIG_DIR
}

// 读取完整配置对象（供 /api/config 一次性返回）
export function getAllConfig() {
  const cfg = loadConfig()
  return {
    appName: cfg.appName,
    renewalThreshold: cfg.renewalThreshold,
    backupKeepDays: cfg.backupKeepDays,
    backupInterval: cfg.backupInterval,
    backupMaxCount: cfg.backupMaxCount,
    moduleEnabled: { ...cfg.moduleEnabled },
  }
}

// 读取续费预警阈值
export function getRenewalThreshold() {
  const cfg = loadConfig()
  return cfg.renewalThreshold
}

// 修改续费预警阈值
export function setRenewalThreshold(val) {
  const cfg = loadConfig()
  const n = Number(val)
  cfg.renewalThreshold = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : DEFAULT_RENEWAL_THRESHOLD
  persist()
  return cfg.renewalThreshold
}

// 读取备份保留天数
export function getBackupKeepDays() {
  const cfg = loadConfig()
  return cfg.backupKeepDays
}

// 修改备份保留天数
export function setBackupKeepDays(val) {
  const cfg = loadConfig()
  const n = Number(val)
  cfg.backupKeepDays = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : DEFAULT_BACKUP_KEEP_DAYS
  persist()
  return cfg.backupKeepDays
}

// 读取备份频率
export function getBackupInterval() {
  const cfg = loadConfig()
  return cfg.backupInterval
}

// 修改备份频率
export function setBackupInterval(val) {
  const cfg = loadConfig()
  cfg.backupInterval = normalizeBackupInterval(val)
  persist()
  return cfg.backupInterval
}

// 读取备份最大保留份数
export function getBackupMaxCount() {
  const cfg = loadConfig()
  return cfg.backupMaxCount
}

// 修改备份最大保留份数
export function setBackupMaxCount(val) {
  const cfg = loadConfig()
  const n = Number(val)
  cfg.backupMaxCount = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : DEFAULT_BACKUP_MAX_COUNT
  persist()
  return cfg.backupMaxCount
}

// 读取模块开关
export function getModuleEnabled(moduleId) {
  const cfg = loadConfig()
  return cfg.moduleEnabled[moduleId] !== false
}

// 修改模块开关
export function setModuleEnabled(moduleId, enabled) {
  const cfg = loadConfig()
  cfg.moduleEnabled[moduleId] = !!enabled
  persist()
  return cfg.moduleEnabled[moduleId]
}
