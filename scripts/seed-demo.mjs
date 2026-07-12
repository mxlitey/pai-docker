// 演示种子数据：8 年级、10 课程、20 班级、100 学员，配套报名、排课、点名、公告、审计
// 运行方式：node scripts/seed-demo.mjs
import { getDb, closeDbInstance } from '../node-functions/_lib/store/core.js'
import { hashPassword, createSuperAdmin } from '../node-functions/_lib/auth.js'
import { addGrade } from '../node-functions/_lib/store/grades.js'
import { addCourse } from '../node-functions/_lib/store/courses.js'
import { addClass, addClassMembers } from '../node-functions/_lib/store/classes.js'
import { addStudent } from '../node-functions/_lib/store/students.js'
import { addEnrollment } from '../node-functions/_lib/store/enrollments.js'
import { batchAddSchedules, getSchedulesByDateRange, batchSetAttendance } from '../node-functions/_lib/store/schedules.js'
import { addAuditLog } from '../node-functions/_lib/store/audit.js'
import { saveAnnouncement } from '../node-functions/_lib/store/announcements.js'
import { now, today } from '../node-functions/_lib/time.js'
import { genAuditId } from '../node-functions/_lib/id.js'

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'admin123'

const AUDIT_ACTOR = { actorId: 'system', actorName: '系统初始化', actorRole: 'superadmin' }
async function audit(action, module, info) {
  await addAuditLog({
    ...AUDIT_ACTOR, action, module,
    targetType: info.targetType || '',
    targetId: info.targetId || '',
    targetName: info.targetName || '',
    summary: info.summary || '',
    before: info.before || null,
    after: info.after || null,
    ip: '127.0.0.1', userAgent: 'seed-demo',
  })
}

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function pad(n, w = 2) { return String(n).padStart(w, '0') }
function dateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function main() {
  console.log('[seed-demo] 开始写入演示数据...')

  const db = getDb()

  // 0. 超管账号
  const existingAdmin = db.prepare('SELECT 1 FROM admins WHERE username=?').get(ADMIN_USER)
  if (!existingAdmin) {
    const hash = await hashPassword(ADMIN_PASS)
    await createSuperAdmin(ADMIN_USER, hash)
    console.log(`[seed-demo] 超管账号已创建：${ADMIN_USER} / ${ADMIN_PASS}`)
    await audit('create', 'admin', { targetType: 'admin', targetName: ADMIN_USER, summary: `创建超管账号 ${ADMIN_USER}` })
  } else {
    console.log('[seed-demo] 超管账号已存在，跳过')
  }

  // 1. 年级（8 个）
  const GRADE_NAMES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二']
  const grades = []
  for (let i = 0; i < GRADE_NAMES.length; i++) {
    const r = await addGrade({ name: GRADE_NAMES[i], sortOrder: i, status: 'active', description: '' })
    if (r.created) {
      grades.push(r.grade)
      await audit('create', 'grade', { targetType: 'grade', targetId: r.grade.id, targetName: r.grade.name, summary: `创建年级 ${r.grade.name}` })
    } else if (r.duplicateName) {
      const row = db.prepare('SELECT * FROM grades WHERE name=?').get(GRADE_NAMES[i])
      grades.push({ id: row.id, name: row.name, sortOrder: row.sort_order, status: row.status, description: row.description })
    }
  }
  console.log(`[seed-demo] 年级：${grades.length} 个`)

  // 2. 课程（10 个）
  const COURSE_DEFS = [
    { name: '数学思维', color: '#3b82f6', category: '理科', grade: '三年级' },
    { name: '英语启蒙', color: '#ef4444', category: '语言', grade: '一年级' },
    { name: '物理竞赛', color: '#8b5cf6', category: '理科', grade: '初二' },
    { name: '语文阅读', color: '#10b981', category: '语言', grade: '五年级' },
    { name: '化学基础', color: '#f59e0b', category: '理科', grade: '初二' },
    { name: '编程入门', color: '#06b6d4', category: '科技', grade: '六年级' },
    { name: '英语口语', color: '#ec4899', category: '语言', grade: '四年级' },
    { name: '奥数精讲', color: '#6366f1', category: '理科', grade: '六年级' },
    { name: '美术创意', color: '#84cc16', category: '艺术', grade: '二年级' },
    { name: '历史故事', color: '#a855f7', category: '人文', grade: '初一' },
  ]
  const courses = []
  for (const c of COURSE_DEFS) {
    const r = await addCourse({ ...c, billingType: 'per_lesson', term: '2026春季', status: 'active', description: `${c.name}课程` })
    if (r.created) {
      courses.push(r.course)
      await audit('create', 'course', { targetType: 'course', targetId: r.course.id, targetName: r.course.name, summary: `创建课程 ${c.name}` })
    } else {
      const row = db.prepare('SELECT * FROM courses WHERE name=?').get(c.name)
      courses.push({ id: row.id, name: row.name, color: row.color, category: row.category, grade: row.grade })
    }
  }
  console.log(`[seed-demo] 课程：${courses.length} 个`)

  // 3. 班级（20 个）
  const TEACHERS = ['王老师', '李老师', '张老师', '刘老师', '陈老师', '杨老师', '赵老师', '黄老师']
  const LOCATIONS = ['1号教室', '2号教室', '3号教室', '4号教室', '多功能厅', '实验室', '美术室', '机房']
  const TIME_SLOTS = [
    { s: '08:00', e: '09:30' },
    { s: '10:00', e: '11:30' },
    { s: '14:00', e: '15:30' },
    { s: '16:00', e: '17:30' },
    { s: '19:00', e: '20:30' },
  ]
  const classes = []
  for (let i = 0; i < 20; i++) {
    const course = courses[i % courses.length]
    const teacher = TEACHERS[i % TEACHERS.length]
    const location = LOCATIONS[i % LOCATIONS.length]
    const slot = TIME_SLOTS[i % TIME_SLOTS.length]
    const clsName = `${course.name}-${teacher}-${i + 1}班`
    const r = await addClass({
      name: clsName, courseId: course.id, grade: course.grade, teacher,
      location, color: course.color, defaultStartTime: slot.s, defaultEndTime: slot.e,
      capacity: 25, status: 'active', remark: '',
    })
    if (r.created) {
      classes.push(r.class)
      await audit('create', 'class', { targetType: 'class', targetId: r.class.id, targetName: clsName, summary: `创建班级 ${clsName}` })
    } else {
      const row = db.prepare('SELECT * FROM classes WHERE name=?').get(clsName)
      classes.push({ id: row.id, name: row.name, courseId: row.course_id, grade: row.grade, teacher: row.teacher, location: row.location, color: row.color })
    }
  }
  console.log(`[seed-demo] 班级：${classes.length} 个`)

  // 4. 学员（100 名）
  const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗']
  const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚', '桂英', '秀兰', '建国', '建华', '志强', '宇航', '梓涵', '雨萱', '子轩', '若曦']
  const students = []
  for (let i = 0; i < 100; i++) {
    const name = `${rand(SURNAMES)}${rand(GIVEN_NAMES)}`
    const grade = rand(grades).name
    const phone = `138${pad(Math.floor(Math.random() * 100000000), 8)}`
    const r = await addStudent({
      name, grade, phone, parentName: `${rand(SURNAMES)}先生/女士`, gender: rand(['男', '女']),
      birthday: `${2010 + Math.floor(Math.random() * 8)}-${pad(Math.floor(Math.random() * 12) + 1)}-${pad(Math.floor(Math.random() * 28) + 1)}`,
      status: 'active', tags: '演示数据', remark: '演示学员', source: 'seed-demo',
    })
    if (r.created) {
      students.push(r.student)
    } else {
      const row = db.prepare('SELECT * FROM students WHERE name=? AND phone=?').get(name, phone)
      if (row) students.push({ id: row.id, name: row.name, grade: row.grade, phone: row.phone })
    }
  }
  console.log(`[seed-demo] 学员：${students.length} 名`)

  // 5. 班级成员（每班 10-20 名）
  let memberCount = 0
  for (const cls of classes) {
    const shuffled = [...students].sort(() => Math.random() - 0.5)
    const classStudents = shuffled.slice(0, 10 + Math.floor(Math.random() * 11))
    if (classStudents.length === 0) continue
    const r = await addClassMembers(cls.id, classStudents.map((s) => s.id))
    memberCount += r.added || 0
  }
  console.log(`[seed-demo] 班级成员：${memberCount} 条`)

  // 6. 报名记录（每名学员 1-3 门课程）
  const enrollments = []
  for (const stu of students) {
    const courseCount = Math.floor(Math.random() * 3) + 1
    const shuffled = [...courses].sort(() => Math.random() - 0.5).slice(0, courseCount)
    for (const course of shuffled) {
      const purchased = rand([10, 20, 30, 48, 50])
      const gift = rand([0, 0, 0, 2, 5])
      const unitPrice = rand([100, 150, 200, 250, 300])
      const totalAmount = purchased * unitPrice
      const paidAmount = Math.random() < 0.8 ? totalAmount : Math.round(totalAmount * 0.9 * 100) / 100
      const r = await addEnrollment({
        studentId: stu.id, courseId: course.id,
        purchasedHours: purchased, giftHours: gift, unitPrice, totalAmount, paidAmount,
        paymentMethod: rand(['微信', '支付宝', '银行卡', '现金']), paymentStatus: 'paid',
        expiredAt: dateOffset(180), operatorId: 'system', enrolledAt: dateOffset(-Math.floor(Math.random() * 60)),
        note: '',
      })
      if (r.created) {
        enrollments.push(r.enrollment)
      }
    }
  }
  console.log(`[seed-demo] 报名记录：${enrollments.length} 条`)

  // 7. 排课（每名学员 2-5 节课）
  const schedules = []
  for (const stu of students) {
    const stuEnrollments = enrollments.filter((e) => e.studentId === stu.id)
    if (stuEnrollments.length === 0) continue
    const count = Math.floor(Math.random() * 4) + 2
    for (let i = 0; i < count; i++) {
      const en = stuEnrollments[i % stuEnrollments.length]
      const course = courses.find((c) => c.id === en.courseId) || courses[0]
      const cls = classes.find((c) => c.courseId === course.id) || classes[0]
      const dayOffset = Math.floor(Math.random() * 60) - 30
      const slot = TIME_SLOTS[Math.floor(Math.random() * TIME_SLOTS.length)]
      schedules.push({
        studentId: stu.id, studentName: stu.name, classId: cls.id,
        courseId: course.id, courseName: course.name,
        teacher: cls.teacher, location: cls.location,
        date: dateOffset(dayOffset), startTime: slot.s, endTime: slot.e,
        note: '', color: course.color, status: 'scheduled',
      })
    }
  }
  const schedResult = await batchAddSchedules(schedules)
  console.log(`[seed-demo] 排课：创建 ${schedResult.created} 条，跳过 ${schedResult.skipped} 条`)

  // 8. 点名（对过去日期的排课标记出勤）
  const todayStr = today()
  let attendanceItems = []
  let attendanceCount = 0
  for (const stu of students) {
    const pastSchedules = await getSchedulesByDateRange(stu.id, dateOffset(-30), dateOffset(-1))
    for (const s of pastSchedules) {
      if (s.attended === undefined || s.attended === null) {
        attendanceItems.push({ studentId: stu.id, date: s.date, scheduleId: s.id, attended: Math.random() < 0.85 })
      }
    }
    if (attendanceItems.length >= 100) {
      const r = await batchSetAttendance(attendanceItems)
      attendanceCount += attendanceItems.length
      attendanceItems = []
    }
  }
  if (attendanceItems.length > 0) {
    await batchSetAttendance(attendanceItems)
    attendanceCount += attendanceItems.length
  }
  console.log(`[seed-demo] 点名：处理 ${attendanceCount} 条`)

  // 9. 公告
  await saveAnnouncement('欢迎使用排课系统！已写入演示数据：8 个年级、10 门课程、20 个班级、100 名学员，配套报名、排课、点名数据。')
  console.log('[seed-demo] 公告已写入')

  // 10. 审计日志补充
  const auditLogs = []
  const ACTIONS = [
    { action: 'login', module: 'auth', summary: '管理员登录系统' },
    { action: 'view', module: 'student', summary: '查看学员列表' },
    { action: 'view', module: 'course', summary: '查看课程列表' },
    { action: 'view', module: 'schedule', summary: '查看排课日历' },
    { action: 'view', module: 'enrollment', summary: '查看报名记录' },
    { action: 'view', module: 'class', summary: '查看班级列表' },
    { action: 'view', module: 'report', summary: '查看数据报表' },
  ]
  for (let i = 0; i < 150; i++) {
    const a = ACTIONS[i % ACTIONS.length]
    auditLogs.push({ ...AUDIT_ACTOR, ...a, ip: '127.0.0.1', userAgent: 'seed-demo' })
  }
  const stmt = db.prepare(`INSERT INTO audit_logs
    (id, actor_id, actor_name, actor_role, action, module, target_type, target_id, target_name, summary, before_json, after_json, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '', '', '', ?, '', '', ?, ?, ?)`)
  const insertAudits = db.transaction((logs) => {
    for (const l of logs) {
      stmt.run(genAuditId(), l.actorId, l.actorName, l.actorRole, l.action, l.module, l.summary, l.ip, l.userAgent, now())
    }
  })
  insertAudits(auditLogs)
  console.log(`[seed-demo] 审计日志：补充 ${auditLogs.length} 条`)

  // 汇总
  const summary = {
    admins: db.prepare('SELECT COUNT(*) c FROM admins').get().c,
    grades: db.prepare('SELECT COUNT(*) c FROM grades').get().c,
    courses: db.prepare('SELECT COUNT(*) c FROM courses').get().c,
    classes: db.prepare('SELECT COUNT(*) c FROM classes').get().c,
    class_members: db.prepare('SELECT COUNT(*) c FROM class_members').get().c,
    students: db.prepare('SELECT COUNT(*) c FROM students').get().c,
    enrollments: db.prepare('SELECT COUNT(*) c FROM enrollments').get().c,
    schedules: db.prepare('SELECT COUNT(*) c FROM schedules').get().c,
    audit_logs: db.prepare('SELECT COUNT(*) c FROM audit_logs').get().c,
  }
  console.log('[seed-demo] === 数据汇总 ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log('[seed-demo] 超管账号：', ADMIN_USER, '/', ADMIN_PASS)
  console.log('[seed-demo] 完成！')

  closeDbInstance()
}

main().catch((e) => {
  console.error('[seed-demo] 失败：', e)
  process.exit(1)
})
