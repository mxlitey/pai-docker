// Excel 转 JSON 脚本
// 用法：node scripts/excel-to-json.mjs <xlsx文件路径> [输出JSON路径]
// 示例：node scripts/excel-to-json.mjs scripts/排课数据导入模板.xlsx
//       node scripts/excel-to-json.mjs scripts/我的数据.xlsx scripts/my-import.json
import xlsx from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const xlsxPath = process.argv[2]
const outputPath = process.argv[3] || resolve(__dirname, 'import-data.json')

if (!xlsxPath) {
  console.error('用法: node scripts/excel-to-json.mjs <xlsx文件路径> [输出JSON路径]')
  console.error('示例: node scripts/excel-to-json.mjs scripts/排课数据导入模板.xlsx')
  process.exit(1)
}

// 字段定义
const STUDENT_FIELDS = ['id', 'name', 'phone', 'grade']
const SCHEDULE_FIELDS = [
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
const STUDENT_REQUIRED = ['id', 'name']
const SCHEDULE_REQUIRED = ['id', 'studentId', 'courseName', 'date']

// 日期格式校验 yyyy-MM-dd
function isValidDate(str) {
  if (typeof str !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}$/.test(str)
}

// 时间格式校验 HH:mm
function isValidTime(str) {
  if (typeof str !== 'string') return false
  return /^\d{2}:\d{2}$/.test(str)
}

// 读取工作表数据（跳过表头与必填标记行）
function readSheet(wb, sheetName, fields, required) {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    console.warn(`⚠  工作表 "${sheetName}" 不存在，已跳过`)
    return []
  }

  // 用 header:1 获取数组形式，保留所有行
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (rows.length < 2) {
    console.warn(`⚠  工作表 "${sheetName}" 数据为空，已跳过`)
    return []
  }

  // 第1行为表头，第2行为必填标记（★必填/选填），从第3行开始是数据
  const headers = rows[0].map((h) => String(h).trim())
  const markRow = rows[1] || []
  const dataRows = rows.slice(2)

  // 校验表头是否匹配
  const missingHeaders = fields.filter((f) => !headers.includes(f))
  if (missingHeaders.length > 0) {
    console.error(`✗ 工作表 "${sheetName}" 缺少表头: ${missingHeaders.join(', ')}`)
    console.error('  请勿修改模板第1行表头')
    process.exit(1)
  }

  const records = []
  const errors = []

  dataRows.forEach((row, index) => {
    // 跳过完全空白的行
    const isEmpty = row.every((cell) => cell === '' || cell === null || cell === undefined)
    if (isEmpty) return

    const record = {}
    headers.forEach((header, i) => {
      if (fields.includes(header)) {
        const value = row[i]
        record[header] = value === null || value === undefined ? '' : String(value).trim()
      }
    })

    // 校验必填字段
    const rowNum = index + 3 // 实际 Excel 行号（含表头2行）
    for (const field of required) {
      if (!record[field]) {
        errors.push(`工作表 "${sheetName}" 第${rowNum}行: 缺少必填字段 "${field}"`)
      }
    }

    // 排课表特殊校验
    if (sheetName === '排课表') {
      if (record.date && !isValidDate(record.date)) {
        errors.push(
          `工作表 "排课表" 第${rowNum}行: date 格式应为 yyyy-MM-dd，当前为 "${record.date}"`,
        )
      }
      if (record.startTime && !isValidTime(record.startTime)) {
        errors.push(
          `工作表 "排课表" 第${rowNum}行: startTime 格式应为 HH:mm，当前为 "${record.startTime}"`,
        )
      }
      if (record.endTime && !isValidTime(record.endTime)) {
        errors.push(
          `工作表 "排课表" 第${rowNum}行: endTime 格式应为 HH:mm，当前为 "${record.endTime}"`,
        )
      }
    }

    // 仅添加有 id 的记录
    if (record.id) {
      records.push(record)
    }
  })

  if (errors.length > 0) {
    console.error('\n✗ 数据校验失败，共发现 ' + errors.length + ' 个问题:')
    errors.forEach((e) => console.error('  ' + e))
    console.error('\n请修正后重新运行')
    process.exit(1)
  }

  return records
}

// 主流程
function main() {
  const absXlsxPath = resolve(xlsxPath)
  console.log(`读取 Excel 文件: ${absXlsxPath}`)

  let buffer
  try {
    buffer = readFileSync(absXlsxPath)
  } catch (err) {
    console.error('✗ 文件读取失败:', err.message)
    process.exit(1)
  }

  const wb = xlsx.read(buffer, { type: 'buffer' })
  console.log(`检测到工作表: ${wb.SheetNames.join(', ')}`)

  const students = readSheet(wb, '学员表', STUDENT_FIELDS, STUDENT_REQUIRED)
  const schedules = readSheet(wb, '排课表', SCHEDULE_FIELDS, SCHEDULE_REQUIRED)

  // 跨表校验：排课表的 studentId 必须在学员表中存在
  if (students.length > 0 && schedules.length > 0) {
    const studentIds = new Set(students.map((s) => s.id))
    const orphanSchedules = schedules.filter((s) => !studentIds.has(s.studentId))
    if (orphanSchedules.length > 0) {
      console.error('\n✗ 跨表校验失败：以下排课记录的 studentId 在学员表中不存在:')
      orphanSchedules.forEach((s) => {
        console.error(`  排课 id=${s.id} 的 studentId="${s.studentId}" 未在学员表中找到`)
      })
      console.error('\n请确保排课表的 studentId 与学员表的 id 一致')
      process.exit(1)
    }
  }

  // 重复 id 检测
  const studentIdSet = new Set()
  const dupStudents = []
  for (const s of students) {
    if (studentIdSet.has(s.id)) dupStudents.push(s.id)
    else studentIdSet.add(s.id)
  }
  if (dupStudents.length > 0) {
    console.error(`\n✗ 学员表存在重复 id: ${dupStudents.join(', ')}`)
    process.exit(1)
  }

  const scheduleIdSet = new Set()
  const dupSchedules = []
  for (const s of schedules) {
    if (scheduleIdSet.has(s.id)) dupSchedules.push(s.id)
    else scheduleIdSet.add(s.id)
  }
  if (dupSchedules.length > 0) {
    console.error(`\n✗ 排课表存在重复 id: ${dupSchedules.join(', ')}`)
    process.exit(1)
  }

  // 生成 JSON
  const result = {
    mode: 'merge',
    students,
    schedules,
  }

  writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')

  console.log('')
  console.log('✓ 转换成功')
  console.log(`  学员数量: ${students.length}`)
  console.log(`  排课数量: ${schedules.length}`)
  console.log(`  导入模式: merge（追加，按 id 去重覆盖）`)
  console.log(`  输出文件: ${outputPath}`)
  console.log('')
  console.log('下一步: 运行导入命令')
  console.log(`  node scripts/import-data.mjs <部署地址> ${outputPath}`)
  console.log('  示例:')
  console.log(`  node scripts/import-data.mjs https://你的域名.edgeone.site ${outputPath}`)
}

main()
