// 生成 Excel 导入模板
// 用法：node scripts/generate-excel-template.mjs
// 产出：scripts/排课数据导入模板.xlsx
// 包含 3 个工作表：使用说明 / 学员表 / 排课表
import xlsx from 'xlsx'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(__dirname, '排课数据导入模板.xlsx')

// ========== 工作表1：使用说明 ==========
const guideData = [
  ['排课数据导入模板使用说明'],
  [''],
  ['一、模板包含三个工作表'],
  ['  1. 使用说明 —— 当前页，请先阅读'],
  ['  2. 学员表 —— 填写学员基础信息'],
  ['  3. 排课表 —— 填写排课详细信息'],
  [''],
  ['二、字段说明（★为必填）'],
  [''],
  ['【学员表】'],
  ['  ★ id         学员唯一编号，建议用 s001、s002 格式'],
  ['  ★ name       学员姓名'],
  ['    phone      联系电话（可选）'],
  ['    grade      年级（可选，如 高三/高二/高一/初三）'],
  [''],
  ['【排课表】'],
  ['  ★ id         排课记录编号，建议用 c0001、c0002 格式，不可重复'],
  ['  ★ studentId  对应学员的 id（必须与学员表的 id 一致）'],
  ['  ★ courseName 课程名称'],
  ['  ★ date       上课日期，格式 yyyy-MM-dd（如 2026-08-03）'],
  ['    startTime  开始时间，格式 HH:mm（如 09:00）'],
  ['    endTime    结束时间，格式 HH:mm（如 10:30）'],
  ['    teacher    授课教师（可选）'],
  ['    location   上课地点（可选）'],
  ['    note       备注（可选）'],
  [''],
  ['三、注意事项'],
  ['  1. 必填字段必须填写，否则导入会失败并提示具体错误'],
  ['  2. 排课表的 studentId 必须能在学员表中找到对应记录'],
  ['  3. 日期格式必须为 yyyy-MM-dd，时间格式必须为 HH:mm'],
  ['  4. id 字段不可重复，重复会覆盖原有记录'],
  ['  5. 不要修改表头行（第1行），否则可能识别失败'],
  [''],
  ['四、导入流程'],
  ['  1. 填写本模板中的学员表与排课表'],
  ['  2. 保存为 .xlsx 文件'],
  ['  3. 运行：node scripts/excel-to-json.mjs <xlsx文件路径>'],
  ['     生成 JSON 文件（默认输出到 scripts/import-data.json）'],
  ['  4. 运行：node scripts/import-data.mjs <部署地址> <JSON文件路径>'],
  ['     完成数据导入'],
  [''],
  ['五、示例数据'],
  ['  学员表与排课表已预填示例数据，可参考格式填写后删除示例行'],
]

const guideSheet = xlsx.utils.aoa_to_sheet(guideData)
// 设置列宽
guideSheet['!cols'] = [{ wch: 70 }]

// ========== 工作表2：学员表 ==========
const studentHeaders = [
  'id',
  'name',
  'phone',
  'grade',
]
const studentRows = [
  ['s001', '张伟', '13800001001', '高三'],
  ['s002', '李娜', '13800001002', '高二'],
  ['s003', '王芳', '13800001003', '高一'],
]
// 第二行标注必填
const studentMarkRow = ['★必填', '★必填', '选填', '选填']
const studentSheet = xlsx.utils.aoa_to_sheet([
  studentHeaders,
  studentMarkRow,
  ...studentRows,
])
studentSheet['!cols'] = [
  { wch: 12 },
  { wch: 15 },
  { wch: 15 },
  { wch: 10 },
]

// ========== 工作表3：排课表 ==========
const scheduleHeaders = [
  'id',
  'studentId',
  'courseName',
  'date',
  'startTime',
  'endTime',
  'teacher',
  'location',
  'note',
]
const scheduleMarkRow = [
  '★必填',
  '★必填',
  '★必填',
  '★必填',
  '选填',
  '选填',
  '选填',
  '选填',
  '选填',
]
const scheduleRows = [
  ['c0001', 's001', '数学提高班', '2026-08-03', '09:00', '10:30', '张老师', 'A教室201', '函数专题'],
  ['c0002', 's001', '英语冲刺班', '2026-08-05', '14:00', '15:30', '李老师', 'B教室105', ''],
  ['c0003', 's002', '物理精品课', '2026-08-03', '10:00', '11:30', '王老师', 'C教室302', ''],
  ['c0004', 's003', '化学专项课', '2026-08-07', '19:00', '20:30', '刘老师', 'A教室203', '实验课'],
]
const scheduleSheet = xlsx.utils.aoa_to_sheet([
  scheduleHeaders,
  scheduleMarkRow,
  ...scheduleRows,
])
scheduleSheet['!cols'] = [
  { wch: 10 },
  { wch: 12 },
  { wch: 18 },
  { wch: 14 },
  { wch: 12 },
  { wch: 12 },
  { wch: 12 },
  { wch: 14 },
  { wch: 20 },
]

// ========== 组装工作簿 ==========
const wb = xlsx.utils.book_new()
xlsx.utils.book_append_sheet(wb, guideSheet, '使用说明')
xlsx.utils.book_append_sheet(wb, studentSheet, '学员表')
xlsx.utils.book_append_sheet(wb, scheduleSheet, '排课表')

writeFileSync(outputPath, xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }))
console.log(`✓ Excel 模板已生成: ${outputPath}`)
console.log('')
console.log('模板包含 3 个工作表:')
console.log('  1. 使用说明 —— 字段说明与导入流程')
console.log('  2. 学员表    —— 2 行示例数据（可删除后填写真实数据）')
console.log('  3. 排课表    —— 4 行示例数据（可删除后填写真实数据）')
console.log('')
console.log('下一步:')
console.log('  1. 打开模板填写数据')
console.log('  2. 运行 node scripts/excel-to-json.mjs scripts/排课数据导入模板.xlsx')
console.log('  3. 运行 node scripts/import-data.mjs <部署地址> scripts/import-data.json')
