// 时间显示工具（方案 A：后端按项目时区写入，前端零转换）
//
// 后端存储的已是项目时区的时间字符串（'yyyy-MM-dd HH:mm:ss'），
// 前端直接截取显示即可，无需任何时区转换。
//
// 纯日期字段（排课 date、生日等）同样是用户输入值，直接显示。

// 空值返回占位符
function display(value: string | null | undefined): string {
  if (!value) return '—'
  return value
}

// 'yyyy-MM-dd HH:mm:ss' → 'yyyy-MM-dd HH:mm'（截掉秒）
export function fmtDateTime(value: string | null | undefined): string {
  const v = display(value)
  return v === '—' ? v : v.slice(0, 16)
}

// 'yyyy-MM-dd HH:mm:ss' → 原样显示（含秒）
export function fmtDateTimeFull(value: string | null | undefined): string {
  return display(value)
}

// 'yyyy-MM-dd HH:mm:ss' → 'yyyy-MM-dd'（只取日期）
export function fmtDate(value: string | null | undefined): string {
  const v = display(value)
  return v === '—' ? v : v.slice(0, 10)
}
