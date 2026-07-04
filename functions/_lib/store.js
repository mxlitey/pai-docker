// Blob 存储封装 —— 基于 EdgeOne Makers Blob
// 数据组织：
//   students/index.json               -> Student[]
//   schedules/{studentId}/{yyyy-MM}.json -> Schedule[]
//   schedules/{studentId}/_index.json    -> 该学员所有排课月份列表（可选加速）
import { getStore } from '@edgeone/pages-blob'

const STORE_NAME = 'schedule-system'

function getBlobStore() {
  // 使用强一致模式，确保排课修改后立即可读
  return getStore({ name: STORE_NAME, consistency: 'strong' })
}

// 读取学员列表
export async function getStudents() {
  const store = getBlobStore()
  const raw = await store.get('students/index.json')
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// 保存学员列表
export async function saveStudents(students) {
  const store = getBlobStore()
  await store.set('students/index.json', JSON.stringify(students))
}

// 按学员ID+月份读取排课
export async function getSchedulesByMonth(studentId, month) {
  const store = getBlobStore()
  const key = `schedules/${studentId}/${month}.json`
  const raw = await store.get(key)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// 按学员ID+月份保存排课
export async function saveSchedulesByMonth(studentId, month, schedules) {
  const store = getBlobStore()
  const key = `schedules/${studentId}/${month}.json`
  await store.set(key, JSON.stringify(schedules))
}

// 列出某学员的所有排课月份文件
export async function listScheduleMonths(studentId) {
  const store = getBlobStore()
  const prefix = `schedules/${studentId}/`
  const result = await store.list({ prefix, limit: 100 })
  // result.items 为 [{ key, ... }]
  const months = (result.items || [])
    .map((item) => item.key)
    .filter((k) => k.endsWith('.json') && !k.includes('_index'))
    .map((k) => k.replace(prefix, '').replace('.json', ''))
    .sort()
  return months
}

// 按学员ID读取所有排课（遍历所有月份）
export async function getAllSchedulesByStudent(studentId) {
  const months = await listScheduleMonths(studentId)
  const results = await Promise.all(
    months.map((m) => getSchedulesByMonth(studentId, m))
  )
  return results.flat()
}

// 按学员ID+日期范围读取排课
export async function getSchedulesByDateRange(studentId, startDate, endDate) {
  const all = await getAllSchedulesByStudent(studentId)
  return all.filter((s) => s.date >= startDate && s.date <= endDate)
}

// ========== 排课修改（含跨月/跨学员处理） ==========

// 计算排课记录的存储路径
function scheduleKey(studentId, date) {
  const month = date.slice(0, 7) // yyyy-MM
  return `schedules/${studentId}/${month}.json`
}

// 删除某学员某月份文件（用于清理空文件）
async function deleteMonthFile(studentId, month) {
  const store = getBlobStore()
  const key = `schedules/${studentId}/${month}.json`
  try {
    await store.delete(key)
  } catch {
    // 删除失败可忽略（文件可能不存在）
  }
}

// 更新单条排课记录
// oldSchedule: 原始记录（用于定位旧文件）
// newSchedule: 新记录（含更新后的字段）
// 返回 { moved: boolean, fromKey, toKey }
export async function updateSchedule(oldSchedule, newSchedule) {
  // 确保 id 一致
  if (oldSchedule.id !== newSchedule.id) {
    throw new Error('排课 id 不可修改')
  }

  const oldKey = scheduleKey(oldSchedule.studentId, oldSchedule.date)
  const newKey = scheduleKey(newSchedule.studentId, newSchedule.date)

  // 情况1：同文件（未跨月未跨学员）—— 原地替换
  if (oldKey === newKey) {
    const list = await getSchedulesByMonth(oldSchedule.studentId, oldSchedule.date.slice(0, 7))
    const idx = list.findIndex((s) => s.id === newSchedule.id)
    if (idx === -1) throw new Error('未找到原排课记录')
    list[idx] = { ...newSchedule }
    await saveSchedulesByMonth(oldSchedule.studentId, oldSchedule.date.slice(0, 7), list)
    return { moved: false, fromKey: oldKey, toKey: newKey }
  }

  // 情况2：跨文件（跨月或跨学员）—— 从旧文件删除，写入新文件
  const [oldStudentId, oldMonth] = [oldSchedule.studentId, oldSchedule.date.slice(0, 7)]
  const [newStudentId, newMonth] = [newSchedule.studentId, newSchedule.date.slice(0, 7)]

  // 从旧文件移除
  const oldList = await getSchedulesByMonth(oldStudentId, oldMonth)
  const filteredOld = oldList.filter((s) => s.id !== newSchedule.id)
  if (filteredOld.length === 0) {
    // 旧文件变空，删除空文件保持存储整洁
    await deleteMonthFile(oldStudentId, oldMonth)
  } else {
    await saveSchedulesByMonth(oldStudentId, oldMonth, filteredOld)
  }

  // 写入新文件
  const newList = await getSchedulesByMonth(newStudentId, newMonth)
  // 去重保护：若新文件已存在同 id 记录则覆盖
  const filteredNew = newList.filter((s) => s.id !== newSchedule.id)
  filteredNew.push({ ...newSchedule })
  // 按日期+时间排序
  filteredNew.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return (a.startTime || '').localeCompare(b.startTime || '')
  })
  await saveSchedulesByMonth(newStudentId, newMonth, filteredNew)

  return { moved: true, fromKey: oldKey, toKey: newKey }
}

// 删除单条排课记录
export async function deleteSchedule(scheduleId, studentId, date) {
  const month = date.slice(0, 7)
  const list = await getSchedulesByMonth(studentId, month)
  const filtered = list.filter((s) => s.id !== scheduleId)
  if (filtered.length === 0) {
    await deleteMonthFile(studentId, month)
  } else {
    await saveSchedulesByMonth(studentId, month, filtered)
  }
  return { deleted: true, count: list.length - filtered.length }
}

// ========== 清空所有数据 ==========

// 清空 Blob 存储中的全部数据（学员 + 排课）
// 返回删除的对象数量
export async function clearAllData() {
  const store = getBlobStore()
  const deletedKeys = []

  // 列出所有对象并逐个删除（分页处理）
  let cursor
  do {
    const result = await store.list({ limit: 100, cursor })
    const items = result.items || []
    for (const item of items) {
      try {
        await store.delete(item.key)
        deletedKeys.push(item.key)
      } catch {
        // 单个删除失败不中断
      }
    }
    cursor = result.cursor || result.nextCursor
  } while (cursor)

  return { deletedCount: deletedKeys.length, keys: deletedKeys }
}

// JSON 响应工具
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
