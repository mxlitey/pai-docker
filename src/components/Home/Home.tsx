// 项目首页 —— 基于 shadcn/ui login-04 布局
// 左侧登录表单 + 右侧项目介绍卡片（移动端单列）
import { useState, useEffect } from 'react'
import { login, getToken, verifyAuth, getBootstrapStatus } from '@/api/admin'
import { Card, CardContent } from '@/components/ui/shadcn/card'
import { Input } from '@/components/ui/shadcn/input'
import { Label } from '@/components/ui/shadcn/label'
import { Button } from '@/components/ui'
import { GITHUB_URL } from '@/config'
import { Calendar, ClipboardCheck, BarChart3, GalleryVerticalEnd, Loader2 } from 'lucide-react'

interface HomeProps {
  appName: string
  onEnterAdmin: () => void
}

export function Home({ appName, onEnterAdmin }: HomeProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

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

  // 右侧介绍卡片内容
  const features = [
    {
      title: '排课点名',
      desc: '批量排课、日历视图、一键点名扣减课时',
      icon: <Calendar className="size-4" strokeWidth={1.8} />,
    },
    {
      title: '报名课时',
      desc: '购课赠课、剩余课时、续费预警一目了然',
      icon: <ClipboardCheck className="size-4" strokeWidth={1.8} />,
    },
    {
      title: '数据报表',
      desc: '营收、课时、出勤、教师绩效多维统计',
      icon: <BarChart3 className="size-4" strokeWidth={1.8} />,
    },
  ]

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
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
                    家长请通过老师发送的专属链接查看排课
                  </p>
                </div>
              </form>

              {/* 右侧：项目介绍（移动端隐藏） */}
              <div className="relative hidden bg-muted md:block">
                <div className="absolute inset-0 flex flex-col justify-center p-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Calendar className="size-4" />
                    </div>
                    <span className="font-semibold text-foreground">{appName}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-foreground tracking-tight mb-3">
                    面向培训机构的排课与教务管理系统
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    覆盖排课点名、报名课时、结转与数据报表，支持细粒度权限分配与家长端专属查询。
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {features.map((f) => (
                      <div key={f.title} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          {f.icon}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{f.title}</div>
                          <div className="text-xs text-muted-foreground leading-relaxed">{f.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 页脚 */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          <span>{appName}</span>
          {GITHUB_URL && (
            <>
              <span className="mx-2">·</span>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                GitHub
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
