// Node HTTP 服务器 —— 替代 EdgeOne 边缘函数运行时
// 职责：
// 1. 路由 /api/* 到 node-functions/api/*.js（按文件名映射，无需逐个注册）
// 2. 托管 dist/ 静态资源（Vite 构建产物）
// 3. 启动时初始化数据库并打印引导提示
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import { getDb, countAdmins } from './node-functions/_lib/store-sqlite.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname

const PORT = Number(process.env.PORT) || 8788
const STATIC_DIR = join(ROOT, 'dist')

// 动态加载所有 API 处理器：/api/students -> node-functions/api/students.js
const apiModules = {}

async function loadApiModules() {
  const apiDir = join(__dirname, 'node-functions', 'api')
  if (!existsSync(apiDir)) return
  const files = await readdirRecursive(apiDir)
  for (const file of files) {
    if (!file.endsWith('.js')) continue
    const rel = file.slice(apiDir.length + 1).replace(/\\/g, '/')
    const route = '/api/' + rel.replace(/\.js$/, '').replace(/\/index$/, '')
    const mod = await import('file://' + file.replace(/\\/g, '/'))
    if (typeof mod.default === 'function' || typeof mod.onRequestGet === 'function') {
      apiModules[route] = mod
    }
  }
}

async function readdirRecursive(dir) {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(dir, { withFileTypes: true })
  const results = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      results.push(...await readdirRecursive(full))
    } else {
      results.push(full)
    }
  }
  return results
}

// MIME 类型映射
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

// 查找匹配的 API 路由
// 支持精确匹配和 /api/auth/bootstrap 这种带后缀的子路由
function matchApiRoute(pathname) {
  // 精确匹配
  if (apiModules[pathname]) return { module: apiModules[pathname], route: pathname }
  // 尝试去掉最后一段，匹配父路由（如 /api/auth/bootstrap -> /api/auth）
  const parts = pathname.split('/')
  for (let i = parts.length - 1; i > 2; i--) {
    const candidate = parts.slice(0, i).join('/')
    if (apiModules[candidate]) {
      return { module: apiModules[candidate], route: candidate }
    }
  }
  return null
}

// 静态资源处理：SPA 回退到 index.html
async function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  pathname = normalize(pathname).replace(/^(\.\.[\/\\])+/, '')

  let filePath = join(STATIC_DIR, pathname)
  if (pathname === '/' || pathname === '') {
    filePath = join(STATIC_DIR, 'index.html')
  }

  // 安全：防止路径遍历
  if (!filePath.startsWith(STATIC_DIR)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    const s = await stat(filePath)
    if (s.isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
    const data = await readFile(filePath)
    res.setHeader('Content-Type', MIME[extname(filePath).toLowerCase()] || 'application/octet-stream')
    res.statusCode = 200
    res.end(data)
  } catch {
    // SPA 回退：未匹配的路径返回 index.html，交给前端路由处理
    try {
      const indexPath = join(STATIC_DIR, 'index.html')
      const data = await readFile(indexPath)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.statusCode = 200
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end('Not Found')
    }
  }
}

// 把 Node 原生 IncomingMessage 转成 Web Request（Edge Function 标准）
function toWebRequest(req) {
  const host = req.headers.host || `localhost:${PORT}`
  const url = `http://${host}${req.url}`
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) {
      for (const vv of v) headers.append(k, vv)
    } else if (v != null) {
      headers.set(k, v)
    }
  }
  const init = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req
    // duplex stream body
    init.duplex = 'half'
  }
  return new Request(url, init)
}

// 把 Web Response 写回 Node 原生 ServerResponse
async function writeWebResponse(webResp, res) {
  res.statusCode = webResp.status
  webResp.headers.forEach((v, k) => res.setHeader(k, v))
  const body = await webResp.arrayBuffer()
  res.end(Buffer.from(body))
}

// 主请求处理
async function handleRequest(req, res) {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.statusCode = 204
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname

  // API 路由
  if (pathname.startsWith('/api/')) {
    const matched = matchApiRoute(pathname)
    if (!matched) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.statusCode = 404
      res.end(JSON.stringify({ code: 1, message: '接口不存在', data: null }))
      return
    }
    try {
      const webReq = toWebRequest(req)
      const env = { ...process.env }
      const context = { request: webReq, env }
      // 兼容 Edge Function 的多种导出形式
      const mod = matched.module
      let webResp
      if (typeof mod.default === 'function') {
        webResp = await mod.default(context)
      } else if (req.method === 'GET' && typeof mod.onRequestGet === 'function') {
        webResp = await mod.onRequestGet(context)
      } else if (req.method === 'POST' && typeof mod.onRequestPost === 'function') {
        webResp = await mod.onRequestPost(context)
      } else if (req.method === 'PUT' && typeof mod.onRequestPut === 'function') {
        webResp = await mod.onRequestPut(context)
      } else if (req.method === 'DELETE' && typeof mod.onRequestDelete === 'function') {
        webResp = await mod.onRequestDelete(context)
      } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.statusCode = 405
        res.end(JSON.stringify({ code: 1, message: '不支持的请求方法', data: null }))
        return
      }
      if (webResp) {
        await writeWebResponse(webResp, res)
      } else {
        res.statusCode = 204
        res.end()
      }
    } catch (e) {
      console.error(`[server] API ${pathname} 异常:`, e?.message || String(e))
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.statusCode = 500
      res.end(JSON.stringify({ code: 1, message: '服务暂不可用，请稍后重试', data: null }))
    }
    return
  }

  // 静态资源
  await serveStatic(req, res)
}

// 启动流程
async function main() {
  // 1. 初始化数据库（建表）
  getDb()
  console.log('[启动] SQLite 数据库已就绪')

  // 2. 加载 API 模块
  await loadApiModules()
  console.log(`[启动] 已加载 ${Object.keys(apiModules).length} 个 API 路由`)

  // 3. 检查引导状态
  const bootstrap = (await countAdmins()) === 0
  if (bootstrap) {
    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('  ⚠️  系统尚未初始化')
    console.log('  首次使用请访问 http://<服务器地址>:' + PORT + ' 完成超管账号创建引导')
    console.log('  或调用 POST /api/auth/bootstrap 接口设置超管密码')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')
  } else {
    console.log('[启动] 超管账号已存在，引导已完成')
  }

  // 4. 启动 HTTP 服务
  const server = createServer(handleRequest)
  server.listen(PORT, () => {
    console.log(`[启动] 排课系统 Docker 版已启动：http://0.0.0.0:${PORT}`)
    console.log(`[启动] 静态资源目录：${STATIC_DIR}`)
  })
}

main().catch((e) => {
  console.error('[启动] 致命错误:', e?.message || String(e))
  process.exit(1)
})
