import { getDb } from './core.js'

// ========== 报表 ==========
// 所有报表函数接收 { startDate, endDate, groupBy }（均可选），返回 { rows, summary }。
// groupBy 为空时整体汇总（单行 key='全部'）；日期过滤采用参数化查询防注入。

// 营收报表：已支付报名的营收/笔数/折扣，按 enrolled_at（空则 created_at 兜底）过滤
export async function getReportRevenue({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const dateCol = 'COALESCE(enrollments.enrolled_at, enrollments.created_at)'
  const where = ['paid_amount > 0']
  const params = []
  if (startDate) { where.push(`${dateCol} >= ?`); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push(`${dateCol} <= ?`); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  let join = ''
  if (groupBy === 'day') {
    selectKey = `substr(${dateCol}, 1, 10) AS key`
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = `substr(${dateCol}, 1, 7) AS key`
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'course') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = "COALESCE(courses.name, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    // 报名关联课程，课程已无 teacher 字段；通过 schedules 取教师（取该课程下排课的教师）
    join = "LEFT JOIN (SELECT DISTINCT course_id, teacher FROM schedules WHERE teacher != '') sc ON sc.course_id = enrollments.course_id"
    selectKey = "COALESCE(sc.teacher, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COALESCE(SUM(paid_amount), 0) AS revenue,
      COUNT(*) AS count,
      COALESCE(SUM(discount_amount), 0) AS discount
    FROM enrollments ${join}
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    revenue: Number(r.revenue) || 0,
    count: Number(r.count) || 0,
    discount: Number(r.discount) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.revenue += r.revenue
    acc.count += r.count
    acc.discount += r.discount
    return acc
  }, { revenue: 0, count: 0, discount: 0 })
  return { rows, summary }
}

// 课时消耗报表：已到课（attended=1）的排课条数，按 date 过滤
export async function getReportHoursConsumption({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ['attended = 1']
  const params = []
  if (startDate) { where.push('date >= ?'); params.push(startDate) }
  if (endDate) { where.push('date <= ?'); params.push(endDate) }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  if (groupBy === 'day') {
    selectKey = 'substr(date, 1, 10) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = 'substr(date, 1, 7) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'course') {
    selectKey = "COALESCE(course_name, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    selectKey = "COALESCE(teacher, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COUNT(*) AS consumed
    FROM schedules
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    consumed: Number(r.consumed) || 0,
  }))
  const summary = { consumed: rows.reduce((s, r) => s + r.consumed, 0) }
  return { rows, summary }
}

// 课时余额报表：活跃报名的剩余与总课时，按 created_at 过滤（可选）
export async function getReportHoursBalance({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ["enrollments.status = 'active'"]
  const params = []
  if (startDate) { where.push('enrollments.created_at >= ?'); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push('enrollments.created_at <= ?'); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  let join = ''
  if (groupBy === 'course') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = "COALESCE(courses.name, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    join = "LEFT JOIN (SELECT DISTINCT course_id, teacher FROM schedules WHERE teacher != '') sc ON sc.course_id = enrollments.course_id"
    selectKey = "COALESCE(sc.teacher, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COALESCE(SUM(COALESCE(remaining_paid_hours, 0) + COALESCE(remaining_gift_hours, 0)), 0) AS remaining,
      COALESCE(SUM(COALESCE(purchased_hours, 0) + COALESCE(gift_hours, 0)), 0) AS total
    FROM enrollments ${join}
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    remaining: Number(r.remaining) || 0,
    total: Number(r.total) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.remaining += r.remaining
    acc.total += r.total
    return acc
  }, { remaining: 0, total: 0 })
  return { rows, summary }
}

// 出勤率报表：到课/缺勤/总数与出勤率，按 date 过滤
export async function getReportAttendanceRate({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ['1=1']
  const params = []
  if (startDate) { where.push('date >= ?'); params.push(startDate) }
  if (endDate) { where.push('date <= ?'); params.push(endDate) }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  if (groupBy === 'day') {
    selectKey = 'substr(date, 1, 10) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = 'substr(date, 1, 7) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'course') {
    selectKey = "COALESCE(course_name, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'teacher') {
    selectKey = "COALESCE(teacher, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COUNT(*) AS total,
      SUM(attended = 1) AS attended,
      SUM(attended = 0) AS absent
    FROM schedules
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => {
    const total = Number(r.total) || 0
    const attended = Number(r.attended) || 0
    const absent = Number(r.absent) || 0
    return {
      key: r.key == null ? '全部' : String(r.key),
      total,
      attended,
      absent,
      rate: total > 0 ? Math.round(attended / total * 1000) / 10 : 0,
    }
  })
  const summary = rows.reduce((acc, r) => {
    acc.total += r.total
    acc.attended += r.attended
    acc.absent += r.absent
    return acc
  }, { total: 0, attended: 0, absent: 0 })
  summary.rate = summary.total > 0 ? Math.round(summary.attended / summary.total * 1000) / 10 : 0
  return { rows, summary }
}

// 结转统计报表：转移金额/课时/笔数，按 created_at 过滤
export async function getReportTransfers({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const where = ['1=1']
  const params = []
  if (startDate) { where.push('transfers.created_at >= ?'); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push('transfers.created_at <= ?'); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  if (groupBy === 'day') {
    selectKey = 'substr(transfers.created_at, 1, 10) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'month') {
    selectKey = 'substr(transfers.created_at, 1, 7) AS key'
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COALESCE(SUM(refund_amount), 0) AS amount,
      COUNT(*) AS count
    FROM transfers
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    amount: Number(r.amount) || 0,
    count: Number(r.count) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.amount += r.amount
    acc.count += r.count
    return acc
  }, { amount: 0, count: 0 })
  return { rows, summary }
}

// 报名统计报表：报名笔数与金额，按 enrolled_at（空则 created_at 兜底）过滤
export async function getReportEnrollmentStats({ startDate, endDate, groupBy } = {}) {
  const db = getDb()
  const dateCol = 'COALESCE(enrollments.enrolled_at, enrollments.created_at)'
  const where = ['1=1']
  const params = []
  if (startDate) { where.push(`${dateCol} >= ?`); params.push(startDate + ' 00:00:00') }
  if (endDate) { where.push(`${dateCol} <= ?`); params.push(endDate + ' 23:59:59') }

  let selectKey = "'全部' AS key"
  let groupByClause = ''
  let join = ''
  if (groupBy === 'course') {
    join = 'LEFT JOIN courses ON enrollments.course_id = courses.id'
    selectKey = "COALESCE(courses.name, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  } else if (groupBy === 'status') {
    selectKey = "COALESCE(status, '') AS key"
    groupByClause = 'GROUP BY key ORDER BY key'
  }

  const sql = `SELECT ${selectKey},
      COUNT(*) AS count,
      COALESCE(SUM(total_amount), 0) AS amount
    FROM enrollments ${join}
    WHERE ${where.join(' AND ')}
    ${groupByClause}`
  const rawRows = db.prepare(sql).all(...params)
  const rows = rawRows.map(r => ({
    key: r.key == null ? '全部' : String(r.key),
    count: Number(r.count) || 0,
    amount: Number(r.amount) || 0,
  }))
  const summary = rows.reduce((acc, r) => {
    acc.count += r.count
    acc.amount += r.amount
    return acc
  }, { count: 0, amount: 0 })
  return { rows, summary }
}
