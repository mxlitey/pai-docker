// 时间工具 —— 按项目设置的时区生成时间字符串
//
// 设计原则（方案 A：后端按项目时区写入，前端零转换）：
// - 数据库存储项目时区的时间字符串（'yyyy-MM-dd HH:mm:ss'），前端直接显示无需转换
// - 时区来自 config.json 的 timezone 字段（默认 Asia/Shanghai），可在系统设置页修改
// - 与服务器物理位置无关：部署在海外服务器，写入的仍是项目时区时间
// - 纯日期字段（排课 date、有效期 expiredAt、生日 birthday）按业务语义直接存储用户输入值

import { getTimezone } from './config-file.js'

// 用 Intl.DateTimeFormat 在项目时区下提取各分量，拼接成 'yyyy-MM-dd HH:mm:ss'
function formatInTz(d, withTime) {
  const tz = getTimezone()
  const opts = {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }
  if (withTime) {
    opts.hour = '2-digit'
    opts.minute = '2-digit'
    opts.second = '2-digit'
    opts.hour12 = false
  }
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(d)
  const map = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const h = map.hour === '24' ? '00' : (map.hour || '00')
  const base = `${map.year}-${map.month}-${map.day}`
  return withTime ? `${base} ${h}:${map.minute}:${map.second}` : base
}

// 返回当前项目时区时间字符串 'yyyy-MM-dd HH:mm:ss'
export function now() {
  return formatInTz(new Date(), true)
}

// 返回当前项目时区日期字符串 'yyyy-MM-dd'
export function today() {
  return formatInTz(new Date(), false)
}
