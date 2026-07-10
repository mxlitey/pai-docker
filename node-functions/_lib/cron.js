// 简易 cron 表达式解析与下次执行时间计算
//
// 支持 5 字段标准 cron：分 时 日 月 周
// 字段语法：
//   *       任意值
//   n       精确值
//   a-b     范围
//   a,b,c   列表
//   */n     步长（每隔 n 个单位）
//   a-b/n   范围内步长
//
// 周字段：0=周日, 1=周一, ..., 6=周六, 7=周日
//
// 说明：
// - 本实现按 TZ 环境变量计算"下次执行时间"。TZ=Asia/Shanghai 时，
//   表达式 "0 3 * * *" 即在北京时间每天 3:00 执行。
// - 采用逐分钟扫描法（最多扫描 366 天），实现简单且足够准确，
//   不依赖第三方库。

// 解析单个字段，返回匹配的值集合
function parseField(field, min, max) {
  const result = new Set()
  if (field === '*') {
    for (let i = min; i <= max; i++) result.add(i)
    return result
  }
  for (const part of String(field).split(',')) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/)
    if (!m) throw new Error(`cron 字段格式错误: "${field}"`)
    let start, end
    if (m[1] === '*') {
      start = min
      end = max
    } else if (m[1].includes('-')) {
      const [a, b] = m[1].split('-').map(Number)
      start = a
      end = b
    } else {
      start = Number(m[1])
      end = m[1] === '*' ? max : start
    }
    const step = m[2] ? Number(m[2]) : 1
    for (let i = start; i <= end; i += step) {
      if (i < min || i > max) throw new Error(`cron 值超出范围: ${i}（允许 ${min}-${max}）`)
      result.add(i)
    }
  }
  return result
}

// 校验 cron 表达式合法性，返回 { minutes, hours, days, months, weekdays } 或抛错
export function parseCron(expr) {
  if (typeof expr !== 'string') throw new Error('cron 表达式需为字符串')
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('cron 表达式需为 5 个字段：分 时 日 月 周')
  const [minF, hourF, dayF, monthF, weekF] = parts
  return {
    minutes: parseField(minF, 0, 59),
    hours: parseField(hourF, 0, 23),
    days: parseField(dayF, 1, 31),
    months: parseField(monthF, 1, 12),
    weekdays: parseField(weekF, 0, 7), // 0 和 7 都是周日
  }
}

// 计算从 from 之后第一个满足 cron 的时刻（按本地时区，受 TZ 控制）
// 返回 Date 对象；若 366 天内无匹配则返回 null
export function nextCronTime(expr, from = new Date()) {
  const c = parseCron(expr)
  // 规范化 weekday：0/7 都视为周日(0)
  const wds = new Set()
  for (const w of c.weekdays) wds.add(w === 7 ? 0 : w)

  const start = new Date(from)
  // 从下一分钟开始（秒归零），避免命中当前分钟
  start.setSeconds(0, 0)
  start.setMinutes(start.getMinutes() + 1)

  const limit = new Date(start)
  limit.setDate(limit.getDate() + 366)

  const cur = new Date(start)
  while (cur <= limit) {
    const wd = cur.getDay()
    if (
      c.minutes.has(cur.getMinutes()) &&
      c.hours.has(cur.getHours()) &&
      c.days.has(cur.getDate()) &&
      c.months.has(cur.getMonth() + 1) &&
      wds.has(wd)
    ) {
      return cur
    }
    // 逐分钟扫描；为加速，可按字段跳过
    cur.setMinutes(cur.getMinutes() + 1)
  }
  return null
}

// 将 cron 表达式翻译为人类可读的中文描述
// 例：'0 3 * * *' -> '每天 03:00'
//     '*/30 * * * *' -> '每 30 分钟'
//     '0 */2 * * *' -> '每 2 小时的第 0 分钟'
//     '0 3 * * 1' -> '每周一 03:00'
export function describeCron(expr) {
  let c
  try {
    c = parseCron(expr)
  } catch {
    return expr
  }
  const wds = new Set()
  for (const w of c.weekdays) wds.add(w === 7 ? 0 : w)
  const wdNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  // 全 * 且分钟为步长 -> 每 N 分钟
  const minIsEvery = c.minutes.size > 1 && [...c.minutes].every((v, i, arr) => i === 0 || v === arr[i - 1] + 1)
  if (c.hours.size === 24 && c.days.size === 31 && c.months.size === 12 && wds.size === 7 && minIsEvery && c.minutes.size < 60) {
    if (c.minutes.size === 1) return `每小时的 ${pad([...c.minutes][0])} 分`
    // 检测步长
    const step = detectStep([...c.minutes].sort((a, b) => a - b))
    if (step) return `每 ${step} 分钟`
    return `每小时的 ${[...c.minutes].sort((a, b) => a - b).map(pad).join('/')} 分`
  }

  // 小时为步长且分钟固定 -> 每 N 小时
  const hourIsEvery = c.hours.size > 1 && [...c.hours].every((v, i, arr) => i === 0 || v === arr[i - 1] + 1)
  if (c.days.size === 31 && c.months.size === 12 && wds.size === 7 && hourIsEvery && c.hours.size < 24 && c.minutes.size === 1) {
    const min = pad([...c.minutes][0])
    const hStep = detectStep([...c.hours].sort((a, b) => a - b))
    if (hStep) return `每 ${hStep} 小时的 ${min} 分`
  }

  // 每天
  const isDaily = c.days.size === 31 && c.months.size === 12 && wds.size === 7
  if (isDaily) {
    if (c.minutes.size === 1 && c.hours.size === 1) {
      return `每天 ${pad([...c.hours][0])}:${pad([...c.minutes][0])}`
    }
    if (c.minutes.size === 1) {
      return `每天 ${[...c.hours].sort((a, b) => a - b).map((h) => `${pad(h)}:${pad([...c.minutes][0])}`).join('、')}`
    }
    return '每天（自定义时刻）'
  }

  // 每周
  const isWeekly = c.days.size === 31 && c.months.size === 12 && wds.size < 7
  if (isWeekly) {
    const days = [...wds].sort((a, b) => a - b).map((w) => wdNames[w])
    if (c.minutes.size === 1 && c.hours.size === 1) {
      return `每${days.join('、')} ${pad([...c.hours][0])}:${pad([...c.minutes][0])}`
    }
    return `每${days.join('、')}`
  }

  // 每月
  const isMonthly = c.months.size === 12 && wds.size === 7 && c.days.size < 31
  if (isMonthly) {
    const days = [...c.days].sort((a, b) => a - b).join('、')
    if (c.minutes.size === 1 && c.hours.size === 1) {
      return `每月 ${days} 日 ${pad([...c.hours][0])}:${pad([...c.minutes][0])}`
    }
    return `每月 ${days} 日`
  }

  return expr
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// 检测数组的步长：[0,5,10,...] -> 5；非等差返回 0
function detectStep(arr) {
  if (arr.length < 2) return 0
  const step = arr[1] - arr[0]
  for (let i = 2; i < arr.length; i++) {
    if (arr[i] - arr[i - 1] !== step) return 0
  }
  return step > 0 ? step : 0
}
