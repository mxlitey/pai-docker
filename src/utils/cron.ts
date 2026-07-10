// 前端版 cron 表达式解析与描述（与后端 _lib/cron.js 逻辑一致，供系统设置页实时预览用）

function parseField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>()
  if (field === '*') {
    for (let i = min; i <= max; i++) result.add(i)
    return result
  }
  for (const part of String(field).split(',')) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/)
    if (!m) throw new Error(`cron 字段格式错误: "${field}"`)
    let start: number, end: number
    if (m[1] === '*') {
      start = min
      end = max
    } else if (m[1].includes('-')) {
      const [a, b] = m[1].split('-').map(Number)
      start = a
      end = b
    } else {
      start = Number(m[1])
      end = start
    }
    const step = m[2] ? Number(m[2]) : 1
    for (let i = start; i <= end; i += step) {
      if (i < min || i > max) throw new Error(`cron 值超出范围: ${i}（允许 ${min}-${max}）`)
      result.add(i)
    }
  }
  return result
}

export interface ParsedCron {
  minutes: Set<number>
  hours: Set<number>
  days: Set<number>
  months: Set<number>
  weekdays: Set<number>
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('cron 表达式需为 5 个字段：分 时 日 月 周')
  const [minF, hourF, dayF, monthF, weekF] = parts
  return {
    minutes: parseField(minF, 0, 59),
    hours: parseField(hourF, 0, 23),
    days: parseField(dayF, 1, 31),
    months: parseField(monthF, 1, 12),
    weekdays: parseField(weekF, 0, 7),
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function detectStep(arr: number[]): number {
  if (arr.length < 2) return 0
  const step = arr[1] - arr[0]
  for (let i = 2; i < arr.length; i++) {
    if (arr[i] - arr[i - 1] !== step) return 0
  }
  return step > 0 ? step : 0
}

// 将 cron 表达式翻译为人类可读的中文描述
export function describeCron(expr: string): string {
  let c: ParsedCron
  try {
    c = parseCron(expr)
  } catch {
    return expr
  }
  const wds = new Set<number>()
  for (const w of c.weekdays) wds.add(w === 7 ? 0 : w)
  const wdNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  const minArr = [...c.minutes].sort((a, b) => a - b)
  const hourArr = [...c.hours].sort((a, b) => a - b)
  const minIsEvery = minArr.length > 1 && minArr.every((v, i) => i === 0 || v === minArr[i - 1] + 1)

  // 每 N 分钟
  if (c.hours.size === 24 && c.days.size === 31 && c.months.size === 12 && wds.size === 7 && minIsEvery && c.minutes.size < 60) {
    if (c.minutes.size === 1) return `每小时的 ${pad(minArr[0])} 分`
    const step = detectStep(minArr)
    if (step) return `每 ${step} 分钟`
    return `每小时的 ${minArr.map(pad).join('/')} 分`
  }

  // 每 N 小时
  const hourIsEvery = hourArr.length > 1 && hourArr.every((v, i) => i === 0 || v === hourArr[i - 1] + 1)
  if (c.days.size === 31 && c.months.size === 12 && wds.size === 7 && hourIsEvery && c.hours.size < 24 && c.minutes.size === 1) {
    const min = pad(minArr[0])
    const hStep = detectStep(hourArr)
    if (hStep) return `每 ${hStep} 小时的 ${min} 分`
  }

  // 每天
  const isDaily = c.days.size === 31 && c.months.size === 12 && wds.size === 7
  if (isDaily) {
    if (c.minutes.size === 1 && c.hours.size === 1) {
      return `每天 ${pad(hourArr[0])}:${pad(minArr[0])}`
    }
    if (c.minutes.size === 1) {
      return `每天 ${hourArr.map((h) => `${pad(h)}:${pad(minArr[0])}`).join('、')}`
    }
    return '每天（自定义时刻）'
  }

  // 每周
  const isWeekly = c.days.size === 31 && c.months.size === 12 && wds.size < 7
  if (isWeekly) {
    const days = [...wds].sort((a, b) => a - b).map((w) => wdNames[w])
    if (c.minutes.size === 1 && c.hours.size === 1) {
      return `每${days.join('、')} ${pad(hourArr[0])}:${pad(minArr[0])}`
    }
    return `每${days.join('、')}`
  }

  // 每月
  const isMonthly = c.months.size === 12 && wds.size === 7 && c.days.size < 31
  if (isMonthly) {
    const days = [...c.days].sort((a, b) => a - b).join('、')
    if (c.minutes.size === 1 && c.hours.size === 1) {
      return `每月 ${days} 日 ${pad(hourArr[0])}:${pad(minArr[0])}`
    }
    return `每月 ${days} 日`
  }

  return expr
}
