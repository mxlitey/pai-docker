// id 生成器：3 字母前缀 + 时间戳 + 进程内自增计数器 + 随机后缀
// 计数器保证同进程同毫秒内生成的 id 绝对不重复
// 跨请求/跨实例的极小概率碰撞由存储层写入前重生成兜底
//
// 前缀规范（统一 3 字母，便于一眼识别实体类型）：
//   stu_ 学员  crs_ 课程  sch_ 排课  enr_ 报名  trf_ 结转
//   adm_ 管理员  aud_ 审计日志  fdb_ 课后反馈  cup_ 优惠券
//   mem_ 会员卡  smm_ 学员会员卡  led_ 线索  fol_ 线索跟进
let idCounter = 0

function nextSeq() {
  idCounter = (idCounter + 1) % 0x1000000 // 24 位循环计数
  const ts = Date.now().toString(36)
  const seq = idCounter.toString(36).padStart(4, '0')
  const rand = Math.random().toString(36).slice(2, 8)
  return { ts, seq, rand }
}

function makeId(prefix) {
  const { ts, seq, rand } = nextSeq()
  return `${prefix}${ts}${seq}${rand}`
}

export const genStudentId = () => makeId('stu_')
export const genCourseId = () => makeId('crs_')
export const genScheduleId = () => makeId('sch_')
export const genEnrollmentId = () => makeId('enr_')
export const genTransferId = () => makeId('trf_')
export const genAdminId = () => makeId('adm_')
export const genAuditId = () => makeId('aud_')
export const genFeedbackId = () => makeId('fdb_')
export const genCouponId = () => makeId('cup_')
export const genMembershipId = () => makeId('mem_')
export const genStudentMembershipId = () => makeId('smm_')
export const genLeadId = () => makeId('led_')
export const genFollowupId = () => makeId('fol_')
