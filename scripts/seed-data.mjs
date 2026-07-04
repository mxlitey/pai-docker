// 种子数据初始化脚本
// 用法：node scripts/seed-data.mjs [部署地址]
// 示例：node scripts/seed-data.mjs https://your-project.edgeone.site
// 本地：node scripts/seed-data.mjs http://localhost:8788
const baseUrl = process.argv[2] || 'http://localhost:8788'

async function seed() {
  const url = `${baseUrl}/api/seed`
  console.log(`正在初始化种子数据: ${url}`)

  try {
    const resp = await fetch(url, { method: 'POST' })
    const data = await resp.json()

    if (data.code === 0) {
      console.log('✓ 种子数据初始化成功')
      console.log(`  学员数量: ${data.data.studentCount}`)
      console.log(`  排课数量: ${data.data.scheduleCount}`)
      console.log(`  月份文件: ${data.data.monthFiles}`)
    } else {
      console.error('✗ 初始化失败:', data.message)
      process.exit(1)
    }
  } catch (err) {
    console.error('✗ 请求失败:', err.message)
    console.error('  请确认服务地址正确且已部署')
    process.exit(1)
  }
}

seed()
