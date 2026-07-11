// 时间工具：项目统一使用 Asia/Shanghai 时区
// 所有入库时间字符串均为 'yyyy-MM-dd HH:mm:ss'（项目时区），前端零转换
const PROJECT_TZ = 'Asia/Shanghai'

function pad(n) { return String(n).padStart(2, '0') }

function formatInTz(d, withTime) {
  const opts = withTime
    ? { timeZone: PROJECT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
    : { timeZone: PROJECT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value || ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  if (!withTime) return date
  return `${date} ${get('hour')}:${get('minute')}:${get('second')}`
}

export function now() { return formatInTz(new Date(), true) }
export function today() { return formatInTz(new Date(), false) }
export function formatInShanghai(d) { return formatInTz(d instanceof Date ? d : new Date(d), true) }
