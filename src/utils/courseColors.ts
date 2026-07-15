// 课程颜色映射
// color key → Tailwind 类名（卡片背景/文字/边框 + 圆点色）
// 用于课程管理选择颜色、日历卡片按课程着色
// 同时支持十六进制颜色值（#rrggbb / #rgb），hex 时用 inline style 渲染

import type { CSSProperties } from 'react'

export interface CourseColorOption {
  key: string
  label: string
  card: string // 卡片样式：bg + text + border
  dot: string // 圆点色：bg
  text: string // 文字色（用于表格中的颜色标签文字）
}

// 颜色选项（课程管理选择用）
export const COURSE_COLOR_OPTIONS: CourseColorOption[] = [
  { key: 'blue', label: '蓝色', card: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', text: 'text-blue-600' },
  { key: 'green', label: '绿色', card: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500', text: 'text-green-600' },
  { key: 'purple', label: '紫色', card: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', text: 'text-purple-600' },
  { key: 'orange', label: '橙色', card: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', text: 'text-orange-600' },
  { key: 'rose', label: '玫红', card: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', text: 'text-rose-600' },
  { key: 'teal', label: '青色', card: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500', text: 'text-teal-600' },
  { key: 'amber', label: '琥珀', card: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', text: 'text-amber-600' },
  { key: 'indigo', label: '靛蓝', card: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500', text: 'text-indigo-600' },
  { key: 'cyan', label: '天蓝', card: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500', text: 'text-cyan-600' },
  { key: 'pink', label: '粉色', card: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', text: 'text-pink-600' },
]

// key → 颜色选项映射
const COLOR_MAP = new Map(COURSE_COLOR_OPTIONS.map((c) => [c.key, c]))

const DEFAULT_COLOR: CourseColorOption = {
  key: 'slate',
  label: '灰色',
  card: 'bg-slate-50 text-slate-700 border-slate-200',
  dot: 'bg-slate-400',
  text: 'text-slate-600',
}

// 按课程名关键词的旧版颜色映射（向后兼容历史无 color 字段的排课）
const KEYWORD_COLORS: Record<string, string> = {
  数学: 'blue',
  英语: 'green',
  物理: 'purple',
  化学: 'orange',
  语文: 'rose',
  生物: 'teal',
}

// 颜色样式：className + 可选 inline style（hex 颜色时使用）
export interface ColorStyle {
  className: string
  style?: CSSProperties
}

// 判断是否为十六进制颜色（#rgb 或 #rrggbb）
function isHexColor(color?: string): boolean {
  return !!color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
}

// hex 转 rgb 三元组，失败返回 null
function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const num = parseInt(h, 16)
  if (isNaN(num)) return null
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

// 获取卡片样式（支持 key 与 hex）
// 优先级：color 命中 COLOR_MAP → color 为 hex（inline style）→ 课程名关键词 → 默认灰色
export function getCourseCardStyle(color?: string, courseName?: string): ColorStyle {
  // 1. key 命中预定义颜色
  if (color && COLOR_MAP.has(color)) {
    return { className: COLOR_MAP.get(color)!.card }
  }
  // 2. 十六进制颜色：用 inline style 渲染半透明背景 + 纯色文字 + 半透明边框
  if (isHexColor(color)) {
    const rgb = hexToRgb(color!)
    if (rgb) {
      const [r, g, b] = rgb
      return {
        className: 'border',
        style: {
          backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
          color: color,
          borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
        },
      }
    }
  }
  // 3. 按课程名关键词匹配（向后兼容历史无 color 字段的排课）
  if (courseName) {
    for (const [keyword, key] of Object.entries(KEYWORD_COLORS)) {
      if (courseName.includes(keyword) && COLOR_MAP.has(key)) {
        return { className: COLOR_MAP.get(key)!.card }
      }
    }
  }
  // 4. 默认灰色
  return { className: DEFAULT_COLOR.card }
}

// 获取圆点样式（支持 key 与 hex）
export function getCourseDotStyle(color?: string): ColorStyle {
  if (color && COLOR_MAP.has(color)) {
    return { className: COLOR_MAP.get(color)!.dot }
  }
  if (isHexColor(color)) {
    return { className: '', style: { backgroundColor: color } }
  }
  return { className: DEFAULT_COLOR.dot }
}

// ===== 向后兼容：旧函数仅返回 className，hex 时回退到关键词/默认 =====
export function getCourseCardClass(color?: string, courseName?: string): string {
  if (color && COLOR_MAP.has(color)) return COLOR_MAP.get(color)!.card
  if (courseName) {
    for (const [keyword, key] of Object.entries(KEYWORD_COLORS)) {
      if (courseName.includes(keyword) && COLOR_MAP.has(key)) {
        return COLOR_MAP.get(key)!.card
      }
    }
  }
  return DEFAULT_COLOR.card
}

export function getCourseDotClass(color?: string): string {
  if (color && COLOR_MAP.has(color)) return COLOR_MAP.get(color)!.dot
  return DEFAULT_COLOR.dot
}
