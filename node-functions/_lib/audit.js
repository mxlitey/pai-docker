// 审计日志写入助手：从 context.admin 提取操作者，统一写入 audit_logs
// 用法：在写操作成功后调用 await writeAudit(context, { action, module, ... })
//
// 变更明细记录：
// - update 操作应同时传入 before（变更前快照）与 after（变更后快照），
//   writeAudit 会自动计算字段级 diff 并拼入 summary，便于审计追溯具体改了什么。
// - create 操作只需传 after；delete 操作传 before。
import { addAuditLog } from './store.js'
import { getClientIp } from './auth.js'

// 各模块字段中文标签（camelCase 字段名 -> 中文展示名）
// 用于 summary 与前端 diff 展示
export const FIELD_LABELS = {
  students: {
    name: '姓名', grade: '年级', phone: '手机号', parentName: '家长姓名',
    gender: '性别', birthday: '生日', status: '状态', tags: '标签',
    remark: '备注', source: '来源', balance: '账户余额',
  },
  courses: {
    name: '课程名', color: '颜色', billingType: '计费方式',
    term: '学期', status: '状态', category: '分类', grade: '年级', description: '描述',
  },
  enrollments: {
    status: '状态', purchasedHours: '购买课时', giftHours: '赠课课时',
    unitPrice: '单价', totalAmount: '总金额', paidAmount: '已付金额',
    discountAmount: '优惠金额',
    paymentMethod: '支付方式', paymentStatus: '支付状态', contractNo: '合同号',
    expiredAt: '有效期', note: '备注',
  },
  schedules: {
    studentName: '学员', courseName: '课程', teacher: '教师', location: '地点',
    date: '日期', startTime: '开始时间', endTime: '结束时间', note: '备注',
    status: '状态', room: '教室', makeupFor: '补课标记', color: '颜色',
  },
  grades: {
    name: '年级名', sortOrder: '排序', status: '状态', description: '描述',
  },
  transfers: {
    studentId: '学员', fromEnrollmentId: '源报名',
    refundAmount: '退课金额', giftMode: '赠课处理', note: '备注', reason: '原因',
  },
  accounts: {
    type: '流水类型', amount: '金额', balanceAfter: '变动后余额',
    note: '备注', refType: '关联类型', refId: '关联ID',
  },
}

// 计费方式/状态等枚举值的中文展示（用于 diff 输出更可读）
const VALUE_LABELS = {
  status: { active: '进行中', inactive: '停用', settled: '已结转', finished: '已完结', expired: '已过期', scheduled: '已排课' },
  billingType: { per_lesson: '按课时', per_term: '按学期', per_month: '按月' },
  gender: { male: '男', female: '女' },
  giftMode: { discard: '赠课作废', refund: '赠课折算' },
  type: { refund: '退课转入', enroll_deduct: '报名抵扣' },
}

function valueLabel(field, val) {
  if (val === '' || val === null || val === undefined) return '空'
  const map = VALUE_LABELS[field]
  if (map && map[val] !== undefined) return map[val]
  return String(val)
}

// 计算 before/after 之间的字段级差异
// 返回 [{ field, label, from, to }]，仅包含发生变化的字段
export function diffObjects(before, after) {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return []
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  const diffs = []
  for (const f of fields) {
    // 跳过内部字段
    if (f === 'id' || f === 'createdAt' || f === 'created_at' || f === 'updatedAt' || f === 'updated_at') continue
    const b = before[f]
    const a = after[f]
    // 数字归一比较：避免 0 与 '0' 误判为不同
    const bn = typeof b === 'number' ? b : (b !== '' && b !== null && b !== undefined && !Number.isNaN(Number(b)) && String(b).trim() !== '' ? Number(b) : b)
    const an = typeof a === 'number' ? a : (a !== '' && a !== null && a !== undefined && !Number.isNaN(Number(a)) && String(a).trim() !== '' ? Number(a) : a)
    if (bn === an) continue
    // 都是数字则比较数值
    if (typeof bn === 'number' && typeof an === 'number' && bn === an) continue
    diffs.push({ field: f, from: b, to: a })
  }
  return diffs
}

// 拼接变更明细摘要：「字段A: 旧→新；字段B: 旧→新」
// fieldLabels 为该模块的 FIELD_LABELS 子集
export function describeChanges(before, after, fieldLabels = {}) {
  const diffs = diffObjects(before, after)
  if (diffs.length === 0) return ''
  return diffs.map((d) => {
    const label = fieldLabels[d.field] || d.field
    return `${label}: ${valueLabel(d.field, d.from)}→${valueLabel(d.field, d.to)}`
  }).join('；')
}

// 构建 update 操作的完整 summary
// 例：「修改学员「张三」：手机号: 138→139；年级: 幼儿园→一年级」
export function buildUpdateSummary(module, targetName, before, after) {
  const labels = FIELD_LABELS[module] || {}
  const detail = describeChanges(before, after, labels)
  const name = targetName ? `「${targetName}」` : ''
  const moduleVerb = updateVerb(module)
  if (!detail) return `${moduleVerb}${name}（无实质变化）`
  return `${moduleVerb}${name}：${detail}`
}

// 各模块"修改"动词
function updateVerb(module) {
  switch (module) {
    case 'students': return '修改学员'
    case 'courses': return '修改课程'
    case 'enrollments': return '修改报名'
    case 'schedules': return '修改排课'
    case 'grades': return '修改年级'
    default: return '修改'
  }
}

export async function writeAudit(context, info) {
  try {
    const admin = context.admin || {}
    await addAuditLog({
      actorId: admin.id || '',
      actorName: admin.username || admin.realName || '',
      actorRole: admin.role || '',
      action: info.action || '',
      module: info.module || '',
      targetType: info.targetType || '',
      targetId: info.targetId || '',
      targetName: info.targetName || '',
      summary: info.summary || '',
      before: info.before || null,
      after: info.after || null,
      ip: getClientIp(context.request),
      userAgent: context.request.headers.get('user-agent') || '',
    })
  } catch (e) {
    console.error('[audit] 写入失败:', e?.message || String(e))
  }
}
