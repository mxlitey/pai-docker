// 引导页：首次部署时创建超级管理员账号
// 仅在系统未初始化（admin 表为空）时由 AdminPanel 渲染
import { useState } from 'react'
import { bootstrapSuperAdmin } from '@/api/admin'
import { Button, Field, inputClass } from '@/components/ui'
import { CheckCircle2, Info } from 'lucide-react'

interface BootstrapProps {
  onSuccess: () => void
  onExit: () => void
}

// 用户名规则：3-32 位字母/数字/下划线
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/

// 密码强度评估：返回 0-4，越高越强
function passwordStrength(pwd: string): number {
  let score = 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 10) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++
  return Math.min(score, 4)
}

const STRENGTH_LABELS = ['很弱', '弱', '一般', '较强', '强']
const STRENGTH_COLORS = [
  'bg-muted',
  'bg-rose-400',
  'bg-amber-400',
  'bg-blue-400',
  'bg-green-500',
]

export function Bootstrap({ onSuccess, onExit }: BootstrapProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const strength = passwordStrength(password)
  const usernameValid = USERNAME_RE.test(username)
  const passwordsMatch = password === confirmPassword
  const canSubmit =
    usernameValid &&
    password.length >= 6 &&
    passwordsMatch &&
    !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) {
      if (!usernameValid) {
        setError('3-32 位字母、数字、下划线')
      } else if (password.length < 6) {
        setError('密码至少 6 位')
      } else if (!passwordsMatch) {
        setError('两次输入的密码不一致')
      }
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await bootstrapSuperAdmin(username, password, confirmPassword)
      if (result.code === 0) {
        onSuccess()
      } else {
        setError(result.message || '创建失败')
      }
    } catch (e) {
      setError('请求失败' + '：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        {/* 头部 */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary flex items-center justify-center text-white mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{'系统初始化'}</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {'首次使用请创建超级管理员账号'}
          </p>
        </div>

        {/* 提示卡片 */}
        <div className="card p-4 mb-4 bg-amber-50 border-amber-200">
          <div className="flex gap-2.5 text-sm text-amber-700">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">安全提示</p>
              <ul className="text-xs space-y-0.5 text-amber-600">
                <li>· 超管密码用于登录后台管理系统</li>
                <li>· 请妥善保管，密码丢失后需重置数据库恢复</li>
                <li>· 创建成功后此页面将自动关闭</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {/* 用户名 */}
          <Field
            label={'用户名'}
            required
            hint={'3-32 位字母、数字、下划线'}
            error={
              username && !usernameValid
                ? '3-32 位字母、数字、下划线'
                : undefined
            }
          >
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setError('')
              }}
              placeholder="如：admin"
              autoFocus
              className={inputClass}
            />
          </Field>

          {/* 密码 */}
          <Field label={'密码'} required>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              placeholder="至少 6 位"
              className={inputClass}
            />
            {/* 密码强度指示器 */}
            {password && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength ? STRENGTH_COLORS[strength] : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground/70 w-8 text-right">
                  {STRENGTH_LABELS[strength]}
                </span>
              </div>
            )}
          </Field>

          {/* 确认密码 */}
          <Field
            label={'确认密码'}
            required
            error={
              confirmPassword && !passwordsMatch
                ? '两次输入的密码不一致'
                : undefined
            }
          >
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setError('')
              }}
              placeholder="再次输入密码"
              className={inputClass}
            />
          </Field>

          {/* 错误提示 */}
          {error && (
            <div className="bg-destructive/10 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!canSubmit}
            className="w-full"
          >
            {loading ? '创建中…' : '创建超管账号'}
          </Button>

          <Button type="button" variant="ghost" onClick={onExit} className="w-full">
            返回首页
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground/70 mt-4">
          用户名创建后不可修改，请妥善记忆
        </p>
      </div>
    </div>
  )
}
