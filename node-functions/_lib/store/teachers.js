import { getDb } from './core.js'

// 教师绩效统计：按教师聚合课时数与平均评分
export function getTeacherPerformance({ startDate, endDate } = {}) {
  const db = getDb()
  const params = []
  let dateFilter = ''
  if (startDate) { dateFilter += ' AND s.date >= ?'; params.push(startDate) }
  if (endDate) { dateFilter += ' AND s.date <= ?'; params.push(endDate) }
  // 课时统计（到课=1节）来自 schedules 点名，评分来自 feedback
  const rows = db.prepare(`
    SELECT c.teacher AS teacher_id, c.teacher AS teacher_name,
      COUNT(DISTINCT s.id) AS schedule_count,
      SUM(CASE WHEN s.attended=1 THEN 1 ELSE 0 END) AS attended_count,
      (SELECT AVG(f.rating) FROM feedback f WHERE f.teacher_id=c.teacher ${startDate ? 'AND f.date >= ?' : ''} ${endDate ? 'AND f.date <= ?' : ''}) AS avg_rating,
      (SELECT COUNT(*) FROM feedback f WHERE f.teacher_id=c.teacher ${startDate ? 'AND f.date >= ?' : ''} ${endDate ? 'AND f.date <= ?' : ''}) AS feedback_count
    FROM courses c
    LEFT JOIN schedules s ON s.course_id=c.id ${dateFilter}
    WHERE c.teacher <> ''
    GROUP BY c.teacher
    ORDER BY COALESCE(attended_count, 0) DESC
  `).all(...params, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : []), ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : []))
  return rows
}
