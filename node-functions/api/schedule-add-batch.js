// 批量新增排课 API
// POST /api/schedule-add-batch
// body: { courseId, courseName, teacher, location, color, dates: string[], startTime, endTime, note, studentIds: [], classId }
// 为每个 (date, studentId) 组合生成一条排课记录，一次性写入
// classId 必填：排课以班级为单位，studentIds 必须全部为该班级成员
// dates 为多日期数组，支持一次性排多天的课
import { batchAddSchedules, getStudents, getCourseById, getClassById, getClassMembers, findScheduleConflicts, json } from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'
import { writeAudit } from '../_lib/audit.js'
import { genScheduleId } from '../_lib/id.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  const authFail = await requirePermission(context, 'schedules:create')
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)

  const {
    courseId,
    courseName,
    teacher,
    location,
    color,
    dates,
    startTime,
    endTime,
    note,
    studentIds,
    classId,
    makeupFor,
  } = body

  // 字段校验
  if (!courseId) {
    return json({ code: 1, message: '缺少 courseId', data: null }, 400)
  }
  if (!courseName) {
    return json({ code: 1, message: '缺少 courseName', data: null }, 400)
  }
  // dates 必须是非空字符串数组，每个需符合 yyyy-MM-dd
  if (!Array.isArray(dates) || dates.length === 0) {
    return json({ code: 1, message: '请至少选择一个日期', data: null }, 400)
  }
  if (dates.length > 100) {
    return json({ code: 1, message: 'dates 数量不能超过 100 个', data: null }, 400)
  }
  for (const d of dates) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return json({ code: 1, message: `日期格式应为 yyyy-MM-dd，当前为 "${d}"`, data: null }, 400)
    }
  }
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
    return json({ code: 1, message: 'startTime 格式应为 HH:mm', data: null }, 400)
  }
  if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
    return json({ code: 1, message: 'endTime 格式应为 HH:mm', data: null }, 400)
  }
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return json({ code: 1, message: '请至少选择一名学员', data: null }, 400)
  }
  if (studentIds.length > 500) {
    return json({ code: 1, message: 'studentIds 数量不能超过 500 条', data: null }, 400)
  }
  // 班级必填：排课以班级为单位
  if (!classId) {
    return json({ code: 1, message: '缺少 classId（班级为必填项）', data: null }, 400)
  }
  // 补课约束：只能为单学员、单日期生成补课排课
  if (makeupFor) {
    if (studentIds.length > 1) {
      return json({ code: 1, message: '补课排课仅支持单学员', data: null }, 400)
    }
    if (dates.length > 1) {
      return json({ code: 1, message: '补课排课仅支持单日期', data: null }, 400)
    }
  }

  try {
    // 跨表关联校验：courseId 必须存在
    const course = await getCourseById(courseId)
    if (!course) {
      return json({ code: 1, message: `课程 id="${courseId}" 不存在`, data: null }, 404)
    }
    // classId 必填：校验班级存在
    const cls = await getClassById(classId)
    if (!cls) {
      return json({ code: 1, message: `班级 id="${classId}" 不存在`, data: null }, 404)
    }
    // 校验所有学员均为该班级成员
    const members = await getClassMembers(classId)
    const memberIdSet = new Set(members.map((m) => m.id))
    const nonMembers = studentIds.filter((sid) => !memberIdSet.has(sid))
    if (nonMembers.length > 0) {
      return json(
        { code: 1, message: `以下学员不属于班级「${cls.name}」: ${nonMembers.join(', ')}`, data: null },
        400,
      )
    }
    // 校验学员是否存在，并构建 id->name 映射
    const students = await getStudents()
    const studentMap = new Map(students.map((s) => [s.id, s]))
    const invalidIds = studentIds.filter((id) => !studentMap.has(id))
    if (invalidIds.length > 0) {
      return json(
        { code: 1, message: `以下 studentId 不存在: ${invalidIds.join(', ')}`, data: null },
        400,
      )
    }

    // 笛卡尔积：dates × studentIds，为每个组合生成一条排课
    const schedules = []
    const usedIds = new Set() // 请求内去重，确保生成的 id 绝对不重复
    // 时间冲突检测：同一学员同一日期时间段重叠的 scheduled 排课
    if (startTime && endTime) {
      const conflictMap = new Map() // studentId -> Set(date)
      for (const sid of studentIds) {
        for (const date of dates) {
          const conflicts = await findScheduleConflicts(sid, date, startTime, endTime)
          if (conflicts.length > 0) {
            if (!conflictMap.has(sid)) conflictMap.set(sid, new Set())
            conflictMap.get(sid).add(date)
          }
        }
      }
      if (conflictMap.size > 0) {
        const studentNameMap = new Map(students.map((s) => [s.id, s.name]))
        const details = []
        for (const [sid, dateSet] of conflictMap) {
          details.push(`${studentNameMap.get(sid) || sid}: ${Array.from(dateSet).join(', ')}`)
        }
        return json({
          code: 1,
          message: `时间冲突，以下学员在对应日期已有重叠排课：${details.join('；')}`,
          data: { conflicts: Array.from(conflictMap.entries()).map(([sid, ds]) => ({ studentId: sid, dates: Array.from(ds) })) },
        }, 409)
      }
    }
    for (const date of dates) {
      for (const sid of studentIds) {
        const student = studentMap.get(sid)
        let id
        do {
          id = genScheduleId()
        } while (usedIds.has(id))
        usedIds.add(id)
        schedules.push({
          id,
          studentId: sid,
          studentName: student.name,
          classId: classId || '',
          courseId,
          courseName,
          teacher: teacher || '',
          location: location || '',
          date,
          startTime: startTime || '',
          endTime: endTime || '',
          note: note || '',
          color: color || '',
          makeupFor: makeupFor || '',
        })
      }
    }

    const result = await batchAddSchedules(schedules)
    await writeAudit(context, {
      action: 'create',
      module: 'schedules',
      targetType: 'schedule',
      targetId: '',
      targetName: courseName,
      summary: `批量排课「${courseName}」：${result.created} 条` + (result.skipped > 0 ? `，跳过 ${result.skipped} 条重复` : ''),
      after: {
        courseId, courseName, dates,
        studentCount: studentIds.length,
        created: result.created, skipped: result.skipped,
        studentNames: studentIds.map((sid) => studentMap.get(sid).name),
      },
    })
    return json({
      code: 0,
      message: `已新增 ${result.created} 条排课` + (result.skipped > 0 ? `，跳过 ${result.skipped} 条重复` : ''),
      data: { ...result, totalAttempts: schedules.length },
    })
  } catch (e) {
    console.error('[schedule-add-batch] 批量新增异常:', e?.message || String(e))
    return json(
      { code: 1, message: '批量新增失败，请稍后重试', data: null },
      500,
    )
  }
}
