// 数据导入脚本
// 用法：node scripts/import-data.mjs <部署地址> <JSON文件路径>
// 示例：
//   本地：node scripts/import-data.mjs http://localhost:8788 scripts/import-template.json
//   线上：node scripts/import-data.mjs https://pai-xxx.edgeone.site scripts/import-template.json
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseUrl = process.argv[2]
const jsonPath = process.argv[3]

if (!baseUrl || !jsonPath) {
  console.error('用法: node scripts/import-data.mjs <部署地址> <JSON文件路径>')
  console.error('示例: node scripts/import-data.mjs https://pai-xxx.edgeone.site scripts/import-template.json')
  process.exit(1)
}

async function importData() {
  const absPath = resolve(jsonPath)
  console.log(`读取数据文件: ${absPath}`)

  let body
  try {
    body = JSON.parse(readFileSync(absPath, 'utf-8'))
  } catch (err) {
    console.error('✗ JSON 文件解析失败:', err.message)
    process.exit(1)
  }

  const studentCount = body.students?.length || 0
  const scheduleCount = body.schedules?.length || 0
  const mode = body.mode || 'merge'
  console.log(`准备导入: ${studentCount} 条学员, ${scheduleCount} 条排课 (模式: ${mode})`)
  console.log(`目标地址: ${baseUrl}/api/import`)

  try {
    const resp = await fetch(`${baseUrl}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    if (data.code === 0) {
      console.log('\n✓ 导入成功')
      console.log(`  导入模式: ${data.data.mode}`)
      console.log(`  学员总数: ${data.data.studentCount}`)
      console.log(`  本次导入学员: ${data.data.importedStudents}`)
      console.log(`  本次导入排课: ${data.data.importedSchedules}`)
      console.log(`  涉及月份文件: ${data.data.monthFiles}`)
    } else {
      console.error('\n✗ 导入失败:', data.message)
      process.exit(1)
    }
  } catch (err) {
    console.error('\n✗ 请求失败:', err.message)
    console.error('  请确认服务地址正确且已部署')
    process.exit(1)
  }
}

importData()
