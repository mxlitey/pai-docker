#!/usr/bin/env node
// 生成管理员密码的 PBKDF2-SHA256 加盐慢哈希
// 用于设置环境变量 ADMIN_PASSWORD_HASH（推荐替代明文 ADMIN_PASSWORD）
//
// 用法:
//   node scripts/hash-password.mjs
//   node scripts/hash-password.mjs yourpassword
//
// 输出格式: pbkdf2$<iterations>$<saltHex>$<hashHex>
// 将输出值配置为 EdgeOne 环境变量 ADMIN_PASSWORD_HASH
import { randomBytes, pbkdf2Sync } from 'node:crypto'

const password = process.argv[2] || await readPasswordFromStdin()

if (!password) {
  console.error('错误：密码不能为空')
  process.exit(1)
}

if (password.length < 8) {
  console.error('错误：密码至少 8 位')
  process.exit(1)
}

const iterations = 100000
const salt = randomBytes(16)
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256')

const encoded = `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`
console.log('\n请将以下值设置为环境变量 ADMIN_PASSWORD_HASH:\n')
console.log(encoded)
console.log('\n建议同时配置独立的 ADMIN_TOKEN_SECRET（随机字符串）用于 token 签名。')

async function readPasswordFromStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString().trim()
}
