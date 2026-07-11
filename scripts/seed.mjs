// 种子数据脚本：创建超管、年级、课程、班级、500名学员、报名、排课、点名、审计日志
// 运行方式：node scripts/seed.mjs
// 非标准流程测试：250名标准学员 + 250名非标准学员（测试 A/B/D 场景被正确拦截）
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

// 审计日志统一写入辅助
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
    ip: '127.0.0.1', userAgent: 'seed-script',
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
  console.log('[seed] 开始写入种子数据...')

  // 0. 超管账号（若已存在则跳过）
  const db = getDb()
  const existingAdmin = db.prepare('SELECT 1 FROM admins WHERE username=?').get(ADMIN_USER)
  if (!existingAdmin) {
    const hash = await hashPassword(ADMIN_PASS)
    await createSuperAdmin(ADMIN_USER, hash)
    console.log(`[seed] 超管账号已创建：${ADMIN_USER} / ${ADMIN_PASS}`)
    await audit('create', 'admin', { targetType: 'admin', targetName: ADMIN_USER, summary: `创建超管账号 ${ADMIN_USER}` })
  } else {
    console.log('[seed] 超管账号已存在，跳过')
  }

  // 1. 年级（9个）
  const GRADE_NAMES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三']
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
  console.log(`[seed] 年级：${grades.length} 个`)

  // 2. 课程（5个，带年级）
  const COURSE_DEFS = [
    { name: '数学思维', color: '#3b82f6', category: '理科', grade: '三年级' },
    { name: '英语启蒙', color: '#ef4444', category: '语言', grade: '一年级' },
    { name: '物理竞赛', color: '#8b5cf6', category: '理科', grade: '初二' },
    { name: '语文阅读', color: '#10b981', category: '语言', grade: '五年级' },
    { name: '化学基础', color: '#f59e0b', category: '理科', grade: '初三' },
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
  console.log(`[seed] 课程：${courses.length} 个`)

  // 3. 班级（10个，关联课程+年级+教师）
  const TEACHERS = ['王老师', '李老师', '张老师', '刘老师', '陈老师']
  const LOCATIONS = ['1号教室', '2号教室', '3号教室', '多功能厅', '实验室']
  const classes = []
  for (let i = 0; i < 10; i++) {
    const course = courses[i % courses.length]
    const teacher = TEACHERS[i % TEACHERS.length]
    const location = LOCATIONS[i % LOCATIONS.length]
    const clsName = `${course.name}-${teacher}-${i + 1}班`
    const r = await addClass({
      name: clsName, courseId: course.id, grade: course.grade, teacher,
      location, color: course.color, defaultStartTime: '09:00', defaultEndTime: '10:30',
      capacity: 20, status: 'active', remark: '',
    })
    if (r.created) {
      classes.push(r.class)
      await audit('create', 'class', { targetType: 'class', targetId: r.class.id, targetName: clsName, summary: `创建班级 ${clsName}` })
    } else {
      const row = db.prepare('SELECT * FROM classes WHERE name=?').get(clsName)
      classes.push({ id: row.id, name: row.name, courseId: row.course_id, grade: row.grade, teacher: row.teacher, location: row.location, color: row.color })
    }
  }
  console.log(`[seed] 班级：${classes.length} 个`)

  // 4. 学员（500名：250标准 + 250非标准）
  const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗']
  const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚', '桂英', '秀兰', '建国', '建华', '志强']
  const students = []
  const standardStudents = []
  const nonStandardStudents = []
  for (let i = 0; i < 500; i++) {
    const name = `${rand(SURNAMES)}${rand(GIVEN_NAMES)}`
    const grade = rand(grades).name
    const isStandard = i < 250
    const phone = `138${pad(Math.floor(Math.random() * 100000000), 8)}`
    const r = await addStudent({
      name, grade, phone, parentName: `${rand(SURNAMES)}先生/女士`, gender: rand(['男', '女']),
      birthday: `${2010 + Math.floor(Math.random() * 8)}-${pad(Math.floor(Math.random() * 12) + 1)}-${pad(Math.floor(Math.random() * 28) + 1)}`,
      status: 'active', tags: isStandard ? '标准流程' : '非标准流程', remark: isStandard ? '标准报名流程学员' : '非标准流程测试学员', source: 'seed',
    })
    if (r.created) {
      students.push(r.student)
      if (isStandard) standardStudents.push(r.student)
      else nonStandardStudents.push(r.student)
      if (i < 20 || i % 50 === 0) {
        await audit('create', 'student', { targetType: 'student', targetId: r.student.id, targetName: name, summary: `创建学员 ${name}（${i + 1}/500）` })
      }
    } else {
      // 已存在则查回
      const row = db.prepare('SELECT * FROM students WHERE name=? AND phone=?').get(name, phone)
      if (row) {
        students.push({ id: row.id, name: row.name, grade: row.grade, phone: row.phone })
        if (isStandard) standardStudents.push({ id: row.id, name: row.name, grade: row.grade })
        else nonStandardStudents.push({ id: row.id, name: row.name, grade: row.grade })
      }
    }
  }
  console.log(`[seed] 学员：${students.length} 名（标准 ${standardStudents.length} + 非标准 ${nonStandardStudents.length}）`)

  // 5. 班级成员（每个班级 20-30 名学员）
  let memberCount = 0
  for (const cls of classes) {
    const classStudents = students.filter(() => Math.random() < 0.15).slice(0, 25)
    if (classStudents.length === 0) continue
    const r = await addClassMembers(cls.id, classStudents.map((s) => s.id))
    memberCount += r.added || 0
  }
  console.log(`[seed] 班级成员：${memberCount} 条`)

  // 6. 报名记录（标准学员 400 条报名）
  const enrollments = []
  for (const stu of standardStudents) {
    const courseCount = Math.floor(Math.random() * 2) + 1 // 1-2 门课程
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
  console.log(`[seed] 报名记录：${enrollments.length} 条`)

  // 7. 排课（标准学员 800 条）
  const schedules = []
  for (const stu of standardStudents) {
    const stuEnrollments = enrollments.filter((e) => e.studentId === stu.id)
    if (stuEnrollments.length === 0) continue
    const cls = classes.find((c) => c.courseId === stuEnrollments[0].courseId) || classes[0]
    const count = Math.floor(Math.random() * 3) + 2 // 2-4 节课
    for (let i = 0; i < count; i++) {
      const course = courses.find((c) => c.id === stuEnrollments[0].courseId) || courses[0]
      const dayOffset = Math.floor(Math.random() * 30) - 15
      schedules.push({
        studentId: stu.id, studentName: stu.name, classId: cls.id,
        courseId: course.id, courseName: course.name,
        teacher: cls.teacher, location: cls.location,
        date: dateOffset(dayOffset), startTime: '09:00', endTime: '10:30',
        note: '', color: course.color, status: 'scheduled',
      })
    }
  }
  const schedResult = await batchAddSchedules(schedules)
  console.log(`[seed] 排课：创建 ${schedResult.created} 条，跳过 ${schedResult.skipped} 条`)
  if (schedResult.errors.length > 0) {
    console.log(`[seed] 排课错误示例：${schedResult.errors.slice(0, 3).map((e) => e.reason).join('; ')}`)
  }

  // 8. 点名（对过去日期的排课标记到课）
  const todayStr = today()
  let attendanceItems = []
  for (const stu of standardStudents) {
    const pastSchedules = await getSchedulesByDateRange(stu.id, dateOffset(-30), dateOffset(-1))
    for (const s of pastSchedules) {
      if (s.attended === undefined) {
        attendanceItems.push({ studentId: stu.id, date: s.date, scheduleId: s.id, attended: Math.random() < 0.85 })
      }
    }
    if (attendanceItems.length >= 100) {
      await batchSetAttendance(attendanceItems)
      attendanceItems = []
    }
  }
  if (attendanceItems.length > 0) {
    const attResult = await batchSetAttendance(attendanceItems)
    console.log(`[seed] 点名：更新排课 ${attResult.updatedSchedules} 条，报名 ${attResult.updatedEnrollments} 条`)
  }

  // 9. 非标准流程测试（A/B/D 场景，应被拦截）
  console.log('[seed] === 非标准流程测试（应全部被拦截）===')
  // 场景A：跳过报名直接排课（非补课）——应被拦截
  const testA = await batchAddSchedules([{
    studentId: nonStandardStudents[0]?.id || standardStudents[0].id,
    studentName: nonStandardStudents[0]?.name || '测试A',
    courseId: courses[0].id, courseName: courses[0].name,
    date: dateOffset(7), startTime: '09:00', endTime: '10:30', status: 'scheduled',
  }])
  console.log(`[seed] 场景A（跳过报名直接排课）：创建 ${testA.created}，跳过 ${testA.skipped}（应=0创建）`)

  // 场景B：0课时报名——应被拦截
  const testB = await addEnrollment({
    studentId: nonStandardStudents[1]?.id || standardStudents[0].id,
    courseId: courses[1].id, purchasedHours: 0, giftHours: 0, unitPrice: 200, paidAmount: 0,
  })
  console.log(`[seed] 场景B（0课时报名）：created=${testB.created}，invalid=${testB.invalid || '无'}（应 created=false）`)

  // 场景D：不存在的课程排课——应被拦截
  const testD = await batchAddSchedules([{
    studentId: nonStandardStudents[2]?.id || standardStudents[0].id,
    studentName: nonStandardStudents[2]?.name || '测试D',
    courseId: 'crs_nonexistent', courseName: '不存在课程',
    date: dateOffset(7), startTime: '09:00', endTime: '10:30', status: 'scheduled',
  }])
  console.log(`[seed] 场景D（不存在课程排课）：创建 ${testD.created}，跳过 ${testD.skipped}（应=0创建）`)

  // 10. 公告
  await saveAnnouncement('欢迎使用排课系统！本系统已初始化演示数据，包含 500 名学员、9 个年级、5 门课程、10 个班级及配套排课点名数据。')
  console.log('[seed] 公告已写入')

  // 11. 审计日志（批量补充）
  const auditLogs = []
  const ACTIONS = [
    { action: 'login', module: 'auth', summary: '管理员登录系统' },
    { action: 'view', module: 'student', summary: '查看学员列表' },
    { action: 'view', module: 'course', summary: '查看课程列表' },
    { action: 'view', module: 'schedule', summary: '查看排课日历' },
    { action: 'view', module: 'enrollment', summary: '查看报名记录' },
    { action: 'view', module: 'class', summary: '查看班级列表' },
    { action: 'view', module: 'report', summary: '查看数据报表' },
    { action: 'view', module: 'dashboard', summary: '查看数据看板' },
  ]
  for (let i = 0; i < 780; i++) {
    const a = ACTIONS[i % ACTIONS.length]
    auditLogs.push({ ...AUDIT_ACTOR, ...a, ip: '127.0.0.1', userAgent: 'seed-script' })
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
  console.log(`[seed] 审计日志：补充 ${auditLogs.length} 条`)

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
  console.log('[seed] === 数据汇总 ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log('[seed] 超管账号：', ADMIN_USER, '/', ADMIN_PASS)
  console.log('[seed] 完成！')

  closeDbInstance()
}

main().catch((e) => {
  console.error('[seed] 失败：', e)
  process.exit(1)
})
