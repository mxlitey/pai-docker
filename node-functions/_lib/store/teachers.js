import { getDb } from './core.js'

// 教师绩效统计：按教师聚合课时数与平均评分
// teacher_id 关联 admins.id，teacher_name 从 admins.real_name/username 取（fallback 到 schedules.teacher）
export function getTeacherPerformance({ startDate, endDate, teacherId, teacher } = {}) {
  const db = getDb()
  const params = []
  let dateFilter = ''
  if (startDate) { dateFilter += ' AND s.date >= ?'; params.push(startDate) }
  if (endDate) { dateFilter += ' AND s.date <= ?'; params.push(endDate) }
  // 老师过滤：优先用 teacher_id（准确），兼容旧的 teacher 名字
  if (teacherId) { dateFilter += ' AND s.teacher_id = ?'; params.push(teacherId) }
  else if (teacher) { dateFilter += ' AND s.teacher = ?'; params.push(teacher) }
  // 课时统计（到课=1节）来自 schedules 点名，评分来自 feedback（feedback.teacher_id 关联 admins.id）
  const fbDate = []
  let fbFilter = ''
  if (startDate) { fbFilter += ' AND f.date >= ?'; fbDate.push(startDate) }
  if (endDate) { fbFilter += ' AND f.date <= ?'; fbDate.push(endDate) }
  const rows = db.prepare(`
    SELECT s.teacher_id AS teacher_id,
      COALESCE(a.real_name, a.username, s.teacher, '') AS teacher_name,
      COUNT(DISTINCT s.id) AS schedule_count,
      SUM(CASE WHEN s.attended=1 THEN 1 ELSE 0 END) AS attended_count,
      (SELECT AVG(f.rating) FROM feedback f WHERE f.teacher_id=s.teacher_id AND s.teacher_id!='' ${fbFilter}) AS avg_rating,
      (SELECT COUNT(*) FROM feedback f WHERE f.teacher_id=s.teacher_id AND s.teacher_id!='' ${fbFilter}) AS feedback_count
    FROM schedules s
    LEFT JOIN admins a ON a.id = s.teacher_id
    WHERE s.teacher_id <> '' ${dateFilter}
    GROUP BY s.teacher_id
    ORDER BY COALESCE(attended_count, 0) DESC
  `).all(...params, ...fbDate, ...fbDate)
  return rows
}
