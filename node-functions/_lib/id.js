// id 生成器：3 字母前缀 + 时间戳 + 进程内自增计数器 + 随机后缀
// 计数器保证同进程同毫秒内生成的 id 绝对不重复
// 跨请求/跨实例的极小概率碰撞由存储层写入前重生成兜底
// 随机后缀使用密码学安全随机（crypto.getRandomValues），避免可预测
//
// 前缀规范（统一 3 字母，便于一眼识别实体类型）：
//   stu_ 学员  crs_ 课程  sch_ 排课  enr_ 报名  trf_ 结转
//   adm_ 管理员  aud_ 审计日志  fdb_ 课后反馈
//   grd_ 年级  cls_ 班级  chg_ 调课记录
import { webcrypto } from 'node:crypto'

let idCounter = 0

// 生成 6 位 base36 随机后缀（密码学安全）
function secureRandomSuffix() {
  const bytes = webcrypto.getRandomValues(new Uint8Array(4))
  // 把 4 字节拼成 32 位无符号整数，再转 base36 截取 6 位
  let num = 0
  for (let i = 0; i < bytes.length; i++) num = num * 256 + bytes[i]
  return num.toString(36).slice(0, 6).padStart(6, '0')
}

function nextSeq() {
  idCounter = (idCounter + 1) % 0x1000000 // 24 位循环计数
  const ts = Date.now().toString(36)
  const seq = idCounter.toString(36).padStart(4, '0')
  const rand = secureRandomSuffix()
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
export const genGradeId = () => makeId('grd_')
export const genClassId = () => makeId('cls_')
export const genScheduleChangeId = () => makeId('chg_')
export const genAccountTxId = () => makeId('atx_')
