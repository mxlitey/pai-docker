import { getDb } from './core.js'

// 教师绩效统计：按教师聚合课时数与平均评分
// 注意：teacher 字段位于 schedules 表（courses 表无 teacher 列）
export function getTeacherPerformance({ startDate, endDate, teacher } = {}) {
  const db = getDb()
  const params = []
  let dateFilter = ''
  if (startDate) { dateFilter += ' AND s.date >= ?'; params.push(startDate) }
  if (endDate) { dateFilter += ' AND s.date <= ?'; params.push(endDate) }
  if (teacher) { dateFilter += ' AND s.teacher = ?'; params.push(teacher) }
  // 课时统计（到课=1节）来自 schedules 点名，评分来自 feedback
  const rows = db.prepare(`
    SELECT s.teacher AS teacher_id, s.teacher AS teacher_name,
      COUNT(DISTINCT s.id) AS schedule_count,
      SUM(CASE WHEN s.attended=1 THEN 1 ELSE 0 END) AS attended_count,
      (SELECT AVG(f.rating) FROM feedback f WHERE f.teacher_id=s.teacher ${startDate ? 'AND f.date >= ?' : ''} ${endDate ? 'AND f.date <= ?' : ''}) AS avg_rating,
      (SELECT COUNT(*) FROM feedback f WHERE f.teacher_id=s.teacher ${startDate ? 'AND f.date >= ?' : ''} ${endDate ? 'AND f.date <= ?' : ''}) AS feedback_count
    FROM schedules s
    WHERE s.teacher <> '' ${dateFilter}
    GROUP BY s.teacher
    ORDER BY COALESCE(attended_count, 0) DESC
  `).all(...params, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : []), ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : []))
  return rows
}
