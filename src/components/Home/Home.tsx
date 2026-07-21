// 项目首页 —— 基于 shadcn/ui login-04 布局
// 左侧登录表单 + 右侧品牌图片（移动端单列；无图片时右侧空白）
import { useState, useEffect } from 'react'
import { login, getToken, verifyAuth, getBootstrapStatus } from '@/api/admin'
import { Card, CardContent } from '@/components/ui/shadcn/card'
import { Input } from '@/components/ui/shadcn/input'
import { Label } from '@/components/ui/shadcn/label'
import { Button } from '@/components/ui'
import { GITHUB_URL } from '@/config'
import { GalleryVerticalEnd, Loader2 } from 'lucide-react'

interface HomeProps {
  appName: string
  onEnterAdmin: () => void
  // 进入公开搜索页（#search）：供家长/老师通过学员姓名查找排课入口
  onEnterSearch: () => void
}

export function Home({ appName, onEnterAdmin, onEnterSearch }: HomeProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  // 品牌图片加载状态：null=加载中，true=加载成功，false=全部候选均加载失败/不存在
  // 加载失败时右侧不渲染任何内容（保持 Card 两列布局，右侧空白）
  const [brandImgOk, setBrandImgOk] = useState<boolean | null>(null)
  // 品牌图片候选列表：按优先级依次尝试，任一加载成功即显示
  // 用户可将 login.png 或 login.jpg 放入 /app/data/brand/ 目录，无需重新构建镜像
  const brandImgCandidates = ['/brand/login.png', '/brand/login.jpg']
  const [brandImgIdx, setBrandImgIdx] = useState(0)
  const brandImgUrl = brandImgCandidates[brandImgIdx]

  // 检测已有登录态：若 token 有效则直接进入后台
  useEffect(() => {
    let cancelled = false
    async function checkSession() {
      try {
        const { bootstrap } = await getBootstrapStatus()
        if (!cancelled && bootstrap) {
          onEnterAdmin()
          return
        }
      } catch {
        // 引导状态检测失败不阻塞
      }
      if (!getToken()) {
        if (!cancelled) setChecking(false)
        return
      }
      try {
        const result = await verifyAuth()
        if (!cancelled && result.code === 0 && result.data?.valid) {
          onEnterAdmin()
          return
        }
      } catch {
        // token 无效
      }
      if (!cancelled) setChecking(false)
    }
    checkSession()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username) {
      setError('请输入用户名')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await login(username, password)
      if (result.code === 0) {
        onEnterAdmin()
      } else if (result.bootstrap) {
        onEnterAdmin()
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError('请求失败' + '：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 右侧品牌图片由 server.js 的 /brand/* 路由映射到 data/brand/ 目录
  // 依次尝试 login.png → login.jpg，任一加载成功即显示；全部失败则右侧不渲染

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      {/* 主体内容：垂直水平居中 */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm md:max-w-4xl">
          {checking ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="size-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">正在检查登录状态…</p>
            </div>
          ) : (
            <Card className="overflow-hidden p-0">
              <CardContent className="grid p-0 md:grid-cols-2">
                {/* 左侧：登录表单 */}
                <form onSubmit={handleSubmit} className="p-6 md:p-8">
                  <div className="flex flex-col gap-6">
                    {/* 头部 */}
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                        <GalleryVerticalEnd className="size-4" />
                      </div>
                      <h1 className="text-xl font-bold">管理员登录</h1>
                      <p className="text-balance text-sm text-muted-foreground">
                        登录以进入 {appName} 后台管理系统
                      </p>
                    </div>

                    {/* 用户名 */}
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="username">用户名</Label>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => { setUsername(e.target.value); setError('') }}
                        placeholder="请输入用户名"
                        autoFocus
                        required
                      />
                    </div>

                    {/* 密码 */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center">
                        <Label htmlFor="password">密码</Label>
                      </div>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError('') }}
                        placeholder="请输入密码"
                        required
                      />
                    </div>

                    {/* 错误提示 */}
                    {error && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </div>
                    )}

                    {/* 登录按钮 */}
                    <Button type="submit" variant="primary" loading={loading} className="w-full">
                      {loading ? '登录中…' : '登录'}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                      {'家长查看排课请 '}
                      <button
                        type="button"
                        onClick={onEnterSearch}
                        className="text-primary hover:underline align-middle"
                      >
                        搜索学员姓名
                      </button>
                    </p>
                  </div>
                </form>

                {/* 右侧：品牌图片（移动端隐藏；加载失败/无图片时不渲染任何内容） */}
                <div className="relative hidden bg-muted md:block overflow-hidden">
                  {brandImgOk !== false && (
                    <img
                      key={brandImgUrl}
                      src={brandImgUrl}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                      style={{ opacity: brandImgOk === true ? 1 : 0 }}
                      onLoad={() => setBrandImgOk(true)}
                      onError={() => {
                        // 当前候选失败：若仍有后续候选则尝试下一个，否则标记为全部失败
                        if (brandImgIdx < brandImgCandidates.length - 1) {
                          setBrandImgIdx(brandImgIdx + 1)
                        } else {
                          setBrandImgOk(false)
                        }
                      }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 页脚：全宽，贴底（与 PublicSearch.tsx 结构一致） */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <span>{appName}</span>
        {GITHUB_URL && (
          <>
            <span className="mx-2">·</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 align-middle"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.72-4.04-1.59-4.04-1.59-.55-1.38-1.34-1.75-1.34-1.75-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.23 1.85 1.23 1.07 1.8 2.81 1.28 3.5.98.11-.77.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.23-3.17-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.21a11.6 11.6 0 016 0c2.3-1.53 3.3-1.21 3.3-1.21.65 1.65.24 2.87.12 3.17.77.83 1.23 1.88 1.23 3.17 0 4.53-2.81 5.52-5.49 5.81.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .32.21.7.82.58A12.04 12.04 0 0024 12.29C24 5.78 18.63.5 12 .5z" />
              </svg>
              GitHub
            </a>
          </>
        )}
      </footer>
    </div>
  )
}
