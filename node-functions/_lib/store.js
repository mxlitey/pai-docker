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

// ========== 并发控制 ==========
// 模块级写锁：同一 key 的读-改-写操作串行化，防止 TOCTOU 竞态导致重复 id 写入或丢失更新
// 注意：仅在单个边缘函数实例内有效；跨实例并发需存储层 CAS 支持
const writeLocks = new Map()

// 获取单个 key 的写锁，串行化对该 key 的读-改-写操作
async function withWriteLock(key, fn) {
  const prev = writeLocks.get(key) || Promise.resolve()
  let release
  const next = new Promise((r) => {
    release = r
  })
  writeLocks.set(key, prev.then(() => next))
  await prev.catch(() => {}) // 忽略前一个任务的错误，确保锁链不中断
  try {
    return await fn()
  } finally {
    release()
    // 清理：若当前链尾仍是 next，说明已无人排队，可删除以释放内存
    if (writeLocks.get(key) === prev.then(() => next)) {
      writeLocks.delete(key)
    }
  }
}

// 获取多个 key 的写锁（按字典序加锁，避免死锁）
async function withWriteLocks(keys, fn) {
  const sorted = [...new Set(keys.filter(Boolean))].sort()
  async function acquire(idx) {
    if (idx >= sorted.length) return fn()
    return withWriteLock(sorted[idx], () => acquire(idx + 1))
  }
  return acquire(0)
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

// ========== 课程管理 ==========

// 读取课程列表
export async function getCourses() {
  const store = getBlobStore()
  const raw = await store.get('courses/index.json')
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// 保存课程列表
export async function saveCourses(courses) {
  const store = getBlobStore()
  await store.set('courses/index.json', JSON.stringify(courses))
}

// 新增课程
// 若同 id 已存在则拒绝（返回 exists:true）
export async function addCourse(course) {
  return withWriteLock('courses', async () => {
    const courses = await getCourses()
    if (courses.some((c) => c.id === course.id)) {
      return { created: false, exists: true }
    }
    courses.push({ ...course })
    await saveCourses(courses)
    return { created: true, exists: false }
  })
}

// 更新课程（按 id 定位）
export async function updateCourse(course) {
  return withWriteLock('courses', async () => {
    const courses = await getCourses()
    const idx = courses.findIndex((c) => c.id === course.id)
    if (idx === -1) {
      return { updated: false, notFound: true }
    }
    courses[idx] = { ...course }
    await saveCourses(courses)
    return { updated: true, notFound: false }
  })
}

// 删除课程及其所有关联排课
// 1. 扫描所有 schedules/ 文件，删除 courseId 匹配的排课记录
// 2. 从 courses/index.json 移除该课程
// 返回 { courseRemoved, deletedScheduleCount, deletedFiles }
export async function deleteCourseWithSchedules(courseId) {
  // 涉及 courses + schedules，按字典序加锁避免死锁
  return withWriteLocks(['courses', 'schedules'], async () => {
    const store = getBlobStore()
    let deletedScheduleCount = 0
    let deletedFiles = 0

    // 1. 扫描所有排课文件
    const result = await store.list({ prefix: 'schedules/' })
    const items = result.blobs || []
    for (const item of items) {
      const key = item.key
      if (!key.endsWith('.json')) continue
      const raw = await store.get(key)
      if (!raw) continue
      let list
      try {
        list = JSON.parse(raw)
      } catch {
        continue
      }
      if (!Array.isArray(list) || list.length === 0) continue
      // 仅保留 courseId 不匹配的记录
      const filtered = list.filter((s) => s.courseId !== courseId)
      if (filtered.length === list.length) continue // 无变化
      deletedScheduleCount += list.length - filtered.length
      if (filtered.length === 0) {
        // 文件变空，删除
        try {
          await store.delete(key)
          deletedFiles++
        } catch {}
      } else {
        await store.set(key, JSON.stringify(filtered))
      }
    }

    // 2. 从课程列表中移除
    const courses = await getCourses()
    const filteredCourses = courses.filter((c) => c.id !== courseId)
    let courseRemoved = false
    if (filteredCourses.length !== courses.length) {
      await saveCourses(filteredCourses)
      courseRemoved = true
    }

    return {
      courseRemoved,
      deletedScheduleCount,
      deletedFiles,
    }
  })
}

// 批量新增排课（为多个学员同时排同一节课）
// schedules: Schedule[]（每条已含唯一 id）
// 返回 { created, skipped, errors }
export async function batchAddSchedules(schedules) {
  // 收集所有涉及的锁 key（按 学员+月份），按字典序加锁避免死锁
  const lockKeys = new Set()
  for (const s of schedules) {
    lockKeys.add(`schedule:${s.studentId}:${s.date.slice(0, 7)}`)
  }
  return withWriteLocks([...lockKeys], async () => {
    let created = 0
    let skipped = 0
    const errors = []

    // 按学员+月份分组，减少重复读写
    const groups = new Map()
    for (const s of schedules) {
      const month = s.date.slice(0, 7)
      const key = `${s.studentId}|${month}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(s)
    }

    for (const [, groupSchedules] of groups) {
      const studentId = groupSchedules[0].studentId
      const month = groupSchedules[0].date.slice(0, 7)
      const existing = await getSchedulesByMonth(studentId, month)
      const existingIds = new Set(existing.map((s) => s.id))

      for (const s of groupSchedules) {
        if (existingIds.has(s.id)) {
          skipped++
          continue
        }
        existing.push({ ...s })
        existingIds.add(s.id)
        created++
      }

      // 按日期+时间排序
      existing.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return (a.startTime || '').localeCompare(b.startTime || '')
      })

      await saveSchedulesByMonth(studentId, month, existing)
    }

    return { created, skipped, errors }
  })
}

// 新增单个学员
// 若同 id 已存在则拒绝（返回 exists:true），避免重复写入
// 返回 { created:boolean, exists:boolean }
export async function addStudent(student) {
  return withWriteLock('students', async () => {
    const students = await getStudents()
    if (students.some((s) => s.id === student.id)) {
      return { created: false, exists: true }
    }
    students.push({ ...student })
    await saveStudents(students)
    return { created: true, exists: false }
  })
}

// 更新学员信息（按 id 定位）
// 若姓名变更，级联更新该学员所有排课中的 studentName，保证列表显示一致
// 返回 { updated, notFound, nameChanged, updatedScheduleFiles }
export async function updateStudent(student) {
  // 涉及 students + schedules，按字典序加锁避免死锁
  return withWriteLocks(['schedules', 'students'], async () => {
    const students = await getStudents()
    const idx = students.findIndex((s) => s.id === student.id)
    if (idx === -1) {
      return { updated: false, notFound: true, nameChanged: false, updatedScheduleFiles: 0 }
    }
    const oldName = students[idx].name
    students[idx] = { ...student }
    await saveStudents(students)

    // 姓名未变更：无需级联
    if (oldName === student.name) {
      return { updated: true, notFound: false, nameChanged: false, updatedScheduleFiles: 0 }
    }

    // 姓名变更：扫描该学员所有月份排课，更新 studentName
    let updatedScheduleFiles = 0
    const months = await listScheduleMonths(student.id)
    for (const month of months) {
      const list = await getSchedulesByMonth(student.id, month)
      let changed = false
      for (const s of list) {
        if (s.studentId === student.id && s.studentName !== student.name) {
          s.studentName = student.name
          changed = true
        }
      }
      if (changed) {
        await saveSchedulesByMonth(student.id, month, list)
        updatedScheduleFiles++
      }
    }
    return { updated: true, notFound: false, nameChanged: true, updatedScheduleFiles }
  })
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
  // EdgeOne Pages Blob 的 list 返回 { blobs: [{ key, etag }], directories: [] }
  // 且默认会自动聚合所有分页，无需手动翻页
  const result = await store.list({ prefix })
  const months = (result.blobs || [])
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

// 跨学员搜索排课：按日期范围 + 可选 courseId 过滤
// 服务端遍历所有学员的所有月份文件，返回聚合后的排课列表
// 性能：当前数据量级（百名学员 × 数十月份）可接受；按日期范围限定月份切片可显著减少读取次数
export async function searchSchedules({ startDate, endDate, courseId } = {}) {
  const students = await getStudents()

  // 计算需要读取的月份列表（yyyy-MM）
  // 若未指定日期范围，则对每个学员遍历其全部月份文件
  let monthList = null
  if (startDate && endDate) {
    monthList = enumerateMonths(startDate, endDate)
  }

  const tasks = students.map(async (stu) => {
    const months = monthList || (await listScheduleMonths(stu.id))
    const fileTasks = months.map(async (m) => {
      // 月份文件可能不存在；若指定了日期范围，再做一次月内裁剪
      const list = await getSchedulesByMonth(stu.id, m)
      return list
    })
    const results = await Promise.all(fileTasks)
    return results.flat()
  })

  const byStudent = await Promise.all(tasks)
  let all = byStudent.flat()

  // 过滤
  if (startDate) all = all.filter((s) => s.date >= startDate)
  if (endDate) all = all.filter((s) => s.date <= endDate)
  if (courseId) all = all.filter((s) => s.courseId === courseId)

  // 排序：日期升序 → 开始时间升序
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return (a.startTime || '').localeCompare(b.startTime || '')
  })

  return all
}

// 枚举 startDate..endDate 之间的所有 yyyy-MM（闭区间）
// 例：2026-07-29 ~ 2026-09-03 -> ['2026-07', '2026-08', '2026-09']
function enumerateMonths(startDate, endDate) {
  const months = []
  let [y, m] = startDate.slice(0, 7).split('-').map(Number)
  const [ey, em] = endDate.slice(0, 7).split('-').map(Number)
  // 安全上限，避免异常输入导致死循环
  let guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard < 1200) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
    guard++
  }
  return months
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

  const oldStudentId = oldSchedule.studentId
  const oldMonth = oldSchedule.date.slice(0, 7)
  const newStudentId = newSchedule.studentId
  const newMonth = newSchedule.date.slice(0, 7)
  // 收集涉及的锁 key（可能跨学员/跨月），按字典序加锁避免死锁
  const lockKeys = [
    `schedule:${oldStudentId}:${oldMonth}`,
    `schedule:${newStudentId}:${newMonth}`,
  ]

  return withWriteLocks(lockKeys, async () => {
    const oldKey = scheduleKey(oldStudentId, oldSchedule.date)
    const newKey = scheduleKey(newStudentId, newSchedule.date)

    // 情况1：同文件（未跨月未跨学员）—— 原地替换
    if (oldKey === newKey) {
      const list = await getSchedulesByMonth(oldStudentId, oldMonth)
      const idx = list.findIndex((s) => s.id === newSchedule.id)
      if (idx === -1) throw new Error('未找到原排课记录')
      list[idx] = { ...newSchedule }
      await saveSchedulesByMonth(oldStudentId, oldMonth, list)
      return { moved: false, fromKey: oldKey, toKey: newKey }
    }

    // 情况2：跨文件（跨月或跨学员）—— 从旧文件删除，写入新文件
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
  })
}

// 新增单条排课记录
// 若同 id 已存在则拒绝（返回 exists:true），避免重复写入
// 返回 { created:boolean, key, exists:boolean }
export async function addSchedule(schedule) {
  const studentId = schedule.studentId
  const month = schedule.date.slice(0, 7)
  const key = `schedules/${studentId}/${month}.json`

  return withWriteLock(`schedule:${studentId}:${month}`, async () => {
    const list = await getSchedulesByMonth(studentId, month)
    // 去重保护：同 id 已存在则拒绝
    if (list.some((s) => s.id === schedule.id)) {
      return { created: false, key, exists: true }
    }

    list.push({ ...schedule })
    // 按日期+时间排序
    list.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return (a.startTime || '').localeCompare(b.startTime || '')
    })
    await saveSchedulesByMonth(studentId, month, list)
    return { created: true, key, exists: false }
  })
}

// 删除单条排课记录
export async function deleteSchedule(scheduleId, studentId, date) {
  const month = date.slice(0, 7)
  return withWriteLock(`schedule:${studentId}:${month}`, async () => {
    const list = await getSchedulesByMonth(studentId, month)
    const filtered = list.filter((s) => s.id !== scheduleId)
    if (filtered.length === 0) {
      await deleteMonthFile(studentId, month)
    } else {
      await saveSchedulesByMonth(studentId, month, filtered)
    }
    return { deleted: true, count: list.length - filtered.length }
  })
}

// 删除学员及其所有排课数据
// 1. 列出并删除该学员的所有月份排课文件
// 2. 从 students/index.json 中移除该学员
// 返回 { deletedScheduleFiles, studentRemoved }
export async function deleteStudentWithSchedules(studentId) {
  // 涉及 schedules + students，按字典序加锁避免死锁
  return withWriteLocks(['schedules', 'students'], async () => {
    const store = getBlobStore()
    const deletedKeys = []

    // 1. 删除该学员的所有排课文件
    const prefix = `schedules/${studentId}/`
    const result = await store.list({ prefix })
    const items = result.blobs || []
    for (const item of items) {
      try {
        await store.delete(item.key)
        deletedKeys.push(item.key)
      } catch {
        // 单个删除失败不中断
      }
    }

    // 2. 从学员列表中移除
    const students = await getStudents()
    const filtered = students.filter((s) => s.id !== studentId)
    let studentRemoved = false
    if (filtered.length !== students.length) {
      await saveStudents(filtered)
      studentRemoved = true
    }

    return {
      deletedScheduleFiles: deletedKeys.length,
      studentRemoved,
    }
  })
}

// ========== 点名管理（出勤 + 课时扣减） ==========

// 批量设置点名
// items: [{ scheduleId, studentId, date, attended }]
// 规则：
//   - attended=true  → 该排课 attended=true，学员 remainingHours -1
//   - attended=false → 该排课 attended=false，学员 remainingHours +1（回退）
//   - 仅当新旧 attended 值不同时才扣减/回退
//   - 学员 remainingHours 为 undefined 时按 0 处理；为负数时不阻止（前端展示提示）
//   - 排课按月分文件，需按 (studentId, month) 分组读取-修改-写入
// 返回 { updatedSchedules, updatedStudents, errors }
export async function batchSetAttendance(items) {
  // 收集所有涉及的锁 key（排课按 学员+月份 + students），按字典序加锁避免死锁
  const lockKeys = new Set(['students'])
  for (const item of items) {
    const month = String(item.date).slice(0, 7)
    lockKeys.add(`schedule:${item.studentId}:${month}`)
  }

  return withWriteLocks([...lockKeys], async () => {
    const errors = []
    let updatedSchedules = 0
    const studentDeltaMap = new Map() // studentId -> 课时净变化（负=扣减，正=回退）

    // 按 (studentId, month) 分组处理排课
    const groups = new Map() // key: `${studentId}|${month}` -> { studentId, month, items: [{scheduleId, attended}] }
    for (const item of items) {
      const month = String(item.date).slice(0, 7) // yyyy-MM
      const key = `${item.studentId}|${month}`
      if (!groups.has(key)) {
        groups.set(key, { studentId: item.studentId, month, items: [] })
      }
      groups.get(key).items.push({ scheduleId: item.scheduleId, attended: item.attended })
    }

    for (const [, group] of groups) {
      try {
        const list = await getSchedulesByMonth(group.studentId, group.month)
        let changed = false
        for (const gi of group.items) {
          const s = list.find((x) => x.id === gi.scheduleId)
          if (!s) {
            errors.push(`排课 ${gi.scheduleId} 在 ${group.studentId}/${group.month} 中未找到`)
            continue
          }
          const oldAttended = s.attended
          const newAttended = !!gi.attended
          if (oldAttended === newAttended) continue // 值未变化，跳过
          s.attended = newAttended
          changed = true
          updatedSchedules++
          // 计算课时净变化：到课→扣 1，缺勤→回退 +1
          const delta = newAttended ? -1 : 1
          studentDeltaMap.set(
            group.studentId,
            (studentDeltaMap.get(group.studentId) || 0) + delta,
          )
        }
        if (changed) {
          await saveSchedulesByMonth(group.studentId, group.month, list)
        }
      } catch (e) {
        errors.push(`处理 ${group.studentId}/${group.month} 失败: ${e?.message || String(e)}`)
      }
    }

    // 批量更新学员剩余课时
    const students = await getStudents()
    let updatedStudents = 0
    for (const [studentId, delta] of studentDeltaMap) {
      const s = students.find((x) => x.id === studentId)
      if (!s) {
        errors.push(`学员 ${studentId} 未找到，无法更新课时`)
        continue
      }
      const cur = typeof s.remainingHours === 'number' ? s.remainingHours : 0
      s.remainingHours = cur + delta
      updatedStudents++
    }
    if (updatedStudents > 0) {
      await saveStudents(students)
    }

    return { updatedSchedules, updatedStudents, errors }
  })
}

// ========== 公告管理 ==========

// 公告存储键：单文件存储公告内容 + 更新时间
// 结构：{ content: string, updatedAt: string }

// 读取公告（公开，未设置时返回空内容）
export async function getAnnouncement() {
  const store = getBlobStore()
  const raw = await store.get('config/announcement.json')
  if (!raw) return { content: '', updatedAt: '' }
  try {
    const obj = JSON.parse(raw)
    return {
      content: typeof obj.content === 'string' ? obj.content : '',
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
    }
  } catch {
    return { content: '', updatedAt: '' }
  }
}

// 保存公告（鉴权写入）
// content 为空字符串等价于清空公告（前端将不展示）
export async function saveAnnouncement(content) {
  const store = getBlobStore()
  const payload = {
    content: String(content || ''),
    updatedAt: new Date().toISOString(),
  }
  await store.set('config/announcement.json', JSON.stringify(payload))
  return payload
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
