import { useState } from 'react'
import { login } from '@/api/admin'
import { Button, Field, inputClass } from '@/components/ui'
import { Lock as LockIcon } from 'lucide-react'

interface AdminLoginProps {
  onSuccess: () => void
  onExit: () => void
}

export function AdminLogin({ onSuccess, onExit }: AdminLoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
        onSuccess()
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError('请求失败' + '：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* 头部 */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-white mb-4">
            <LockIcon className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{'管理员登录'}</h1>
          <p className="text-sm text-muted-foreground/70 mt-1">请输入用户名与密码</p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <Field label={'用户名'} required>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setError('')
              }}
              placeholder={'请输入用户名'}
              autoFocus
              className={inputClass}
            />
          </Field>

          <Field label={'密码'} required>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              placeholder={'请输入密码'}
              className={inputClass}
            />
          </Field>

          {error && (
            <div className="bg-destructive/10 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {loading ? '登录中…' : '登录'}
          </Button>

          <Button type="button" variant="ghost" onClick={onExit} className="w-full">
            返回首页
          </Button>
        </form>
      </div>
    </div>
  )
}
