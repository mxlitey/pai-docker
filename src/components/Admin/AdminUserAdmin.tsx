// 管理员账号管理页（仅超管使用）—— 增删改管理员账号、重置密码、启停账号
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminUser, AdminRole, CurrentAdmin, PermissionModule } from '@/types'
import {
  listAdmins,
  addAdmin,
  updateAdmin,
  deleteAdmin,
  getCurrentAdmin,
  getPermissionDefinitions,
} from '@/api/admin'
import {
  Button,
  EmptyState,
  Field,
  LoadingBlock,
  Modal,
  ModalFooter,
  SubPageHeader,
  confirmDialog,
  inputClass,
  toast,
} from '@/components/ui'

interface AdminUserAdminProps {
  onBack: () => void
}

// 角色徽章样式：超管=brand、管理员=blue、教师=slate
function roleBadgeClass(role: AdminRole): string {
  switch (role) {
    case 'superadmin':
      return 'bg-brand-50 text-brand-700'
    case 'admin':
      return 'bg-blue-50 text-blue-700'
    case 'teacher':
      return 'bg-slate-100 text-slate-600'
  }
}

function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'superadmin':
      return '超管'
    case 'admin':
      return '管理员'
    case 'teacher':
      return '教师'
  }
}

// 简易日期格式化：2024-01-02T03:04:05 -> 2024-01-02 03:04:05
function fmtDate(s?: string): string {
  if (!s) return '—'
  return String(s).replace('T', ' ').slice(0, 19)
}

export function AdminUserAdmin({ onBack }: AdminUserAdminProps) {
  const { t } = useTranslation()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  // 当前登录用户（用于「不可删除自己」），挂载时读取一次
  const [currentAdmin] = useState<CurrentAdmin | null>(() => getCurrentAdmin())

  const loadAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listAdmins()
      if (result.code === 0) {
        setAdmins(result.data.admins)
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAdmins()
  }, [loadAdmins])

  // 删除账号：需输入用户名确认
  const handleDelete = async (admin: AdminUser) => {
    const ok = await confirmDialog({
      title: t('admin.deleteTitle'),
      message: t('admin.deleteMessage', { username: admin.username }),
      danger: true,
      requireText: admin.username,
      confirmText: '确认删除',
    })
    if (!ok) return
    try {
      const result = await deleteAdmin(admin.id)
      if (result.code === 0) {
        toast.success('账号已删除')
        await loadAdmins()
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={t('admin.title')} onBack={onBack} count={admins.length} countLabel="个">
        <Button variant="primary" onClick={() => setAdding(true)}>
          {'+ '}{t('admin.addAdmin')}
        </Button>
      </SubPageHeader>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <LoadingBlock />
        ) : admins.length === 0 ? (
          <EmptyState
            title="暂无管理员账号"
            description="点击下方按钮创建第一个管理员账号"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                {'+ '}{t('admin.addAdmin')}
              </Button>
            }
          />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">{t('admin.username')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('admin.role')}</th>
                    <th className="text-left py-2 px-2 font-medium">{t('admin.realName')}</th>
                    <th className="text-left py-2 px-2 font-medium">电话</th>
                    <th className="text-left py-2 px-2 font-medium">{t('admin.status')}</th>
                    <th className="text-left py-2 px-2 font-medium">最近登录</th>
                    <th className="text-left py-2 px-2 font-medium">{t('common.createdAt')}</th>
                    <th className="text-right py-2 px-2 font-medium">{t('common.operation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => {
                    const isSelf = !!currentAdmin && currentAdmin.id === a.id
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-2.5 px-2 font-medium text-slate-700">{a.username}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${roleBadgeClass(
                              a.role,
                            )}`}
                          >
                            {roleLabel(a.role)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-600">
                          {a.realName || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600">
                          {a.phone || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-2">
                          {a.status === 'disabled' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                              已禁用
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                              正常
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                          {fmtDate(a.lastLoginAt)}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                          {fmtDate(a.createdAt)}
                        </td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditing(a)}
                            className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            disabled={isSelf}
                            title={isSelf ? t('admin.cannotDeleteSelf') : undefined}
                            className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {adding && (
        <AddAdminModal
          onClose={() => setAdding(false)}
          onSuccess={() => {
            setAdding(false)
            loadAdmins()
          }}
        />
      )}
      {editing && (
        <EditAdminModal
          admin={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null)
            loadAdmins()
          }}
        />
      )}
    </div>
  )
}

// ===== 权限矩阵编辑器 =====
// 展示所有模块的权限点（checkbox），支持「使用角色默认权限」开关与按模块全选
// - useDefault=true：不显示矩阵，提交时 permissions 传空数组（用角色默认）
// - useDefault=false：显示矩阵，按模块勾选具体权限点
function PermissionMatrixEditor({
  definitions,
  useDefault,
  onUseDefaultChange,
  selected,
  onSelectedChange,
  defaultHint,
}: {
  definitions: PermissionModule[]
  useDefault: boolean
  onUseDefaultChange: (v: boolean) => void
  selected: Set<string>
  onSelectedChange: (next: Set<string>) => void
  defaultHint?: string
}) {
  // 切换单个权限点
  const togglePerm = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectedChange(next)
  }

  // 切换某模块全选/全不选
  const toggleModule = (mod: PermissionModule) => {
    const allKeys = mod.actions.map((a) => a.key)
    const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k))
    const next = new Set(selected)
    if (allSelected) {
      allKeys.forEach((k) => next.delete(k))
    } else {
      allKeys.forEach((k) => next.add(k))
    }
    onSelectedChange(next)
  }

  return (
    <div className="rounded-md border border-slate-200 p-3 space-y-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={useDefault}
          onChange={(e) => onUseDefaultChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        <span className="text-sm text-slate-700">使用角色默认权限</span>
        {useDefault && defaultHint && (
          <span className="text-xs text-slate-400">（{defaultHint}）</span>
        )}
      </label>

      {useDefault ? (
        <p className="text-xs text-slate-400">关闭开关后可自定义该账号的具体权限点</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">勾选该账号可执行的具体权限点，未勾选则无权访问对应功能</p>
          {definitions.map((mod) => {
            const allKeys = mod.actions.map((a) => a.key)
            const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k))
            return (
              <div key={mod.module} className="border border-slate-100 rounded-md p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600">{mod.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleModule(mod)}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    {allSelected ? '全不选' : '全选'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {mod.actions.map((a) => {
                    const checked = selected.has(a.key)
                    return (
                      <label
                        key={a.key}
                        className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePerm(a.key)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                        />
                        {a.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 解析 admin.permissions（逗号分隔串）为已勾选集合
function parsePermissions(permissions?: string): Set<string> {
  return new Set(
    (permissions || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

// 加载权限定义矩阵（弹窗挂载时调用）
function usePermissionDefinitions() {
  const [definitions, setDefinitions] = useState<PermissionModule[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPermissionDefinitions()
      .then((res) => {
        if (cancelled) return
        if (res.code === 0) {
          setDefinitions(res.data.definitions)
        } else {
          toast.error(res.message)
        }
      })
      .catch((e) => {
        if (!cancelled) toast.error((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { definitions, loading }
}

// 角色默认权限提示文案
function defaultHintOf(role: AdminRole): string {
  switch (role) {
    case 'superadmin':
      return '超管拥有全部权限'
    case 'admin':
      return '使用管理员默认权限'
    case 'teacher':
      return '使用教师默认权限'
  }
}

// ===== 新增账号弹窗 =====
interface AddForm {
  username: string
  password: string
  role: 'admin' | 'teacher'
  realName: string
  phone: string
}

function AddAdminModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<AddForm>({
    username: '',
    password: '',
    role: 'admin',
    realName: '',
    phone: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // 权限矩阵：默认开启「使用角色默认权限」
  const { definitions: permDefs, loading: permLoading } = usePermissionDefinitions()
  const [useDefaultPerm, setUseDefaultPerm] = useState(true)
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(() => new Set())

  // 局部更新表单，同时清除对应字段的错误
  const update = (patch: Partial<AddForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }

  // 角色：从 select 字符串收敛到联合类型
  const setRole = (value: string) => {
    if (value === 'admin' || value === 'teacher') {
      update({ role: value })
    }
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!/^[A-Za-z0-9_]{3,32}$/.test(form.username)) {
      e.username = '3-32 位字母、数字或下划线'
    }
    if (form.password.length < 6) {
      e.password = '密码至少 6 位'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const result = await addAdmin({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        realName: form.realName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        // 使用默认开关时传空数组（用角色默认）；否则传勾选的权限点
        permissions: useDefaultPerm ? [] : Array.from(selectedPerms),
      })
      if (result.code === 0) {
        toast.success('账号已创建')
        onSuccess()
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('admin.addAdmin')}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onConfirm={submit} loading={saving} confirmText={t('common.create')} />}
    >
      <div className="space-y-4">
        <Field label={t('admin.username')} required error={errors.username} hint="3-32 位字母、数字或下划线">
          <input
            className={inputClass}
            value={form.username}
            onChange={(e) => update({ username: e.target.value })}
            placeholder="如：admin01"
            autoFocus
          />
        </Field>
        <Field label={t('admin.password')} required error={errors.password} hint="至少 6 位">
          <input
            type="password"
            className={inputClass}
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            placeholder="至少 6 位"
          />
        </Field>
        <Field label={t('admin.role')} required hint="超管仅可通过系统初始化创建">
          <select className={inputClass} value={form.role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">{t('admin.roleAdmin')}</option>
            <option value="teacher">{t('admin.roleTeacher')}</option>
          </select>
        </Field>
        <Field label="权限矩阵" hint="仅 admin/teacher 角色可配置；超管拥有全部权限">
          {permLoading ? (
            <div className="text-xs text-slate-400 py-2">加载权限定义中…</div>
          ) : (
            <PermissionMatrixEditor
              definitions={permDefs}
              useDefault={useDefaultPerm}
              onUseDefaultChange={setUseDefaultPerm}
              selected={selectedPerms}
              onSelectedChange={setSelectedPerms}
              defaultHint={defaultHintOf(form.role)}
            />
          )}
        </Field>
        <Field label={t('admin.realName')}>
          <input
            className={inputClass}
            value={form.realName}
            onChange={(e) => update({ realName: e.target.value })}
            placeholder={t('common.optional')}
          />
        </Field>
        <Field label="电话">
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder={t('common.optional')}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ===== 编辑账号弹窗 =====
interface EditForm {
  role: AdminRole
  realName: string
  phone: string
  status: 'active' | 'disabled'
  password: string // 重置密码，留空不改
}

function EditAdminModal({
  admin,
  onClose,
  onSuccess,
}: {
  admin: AdminUser
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const isSuperadmin = admin.role === 'superadmin'
  const [form, setForm] = useState<EditForm>({
    role: admin.role,
    realName: admin.realName || '',
    phone: admin.phone || '',
    status: admin.status || 'active',
    password: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // 权限矩阵：加载时根据 admin.permissions 是否非空决定开关状态
  // - superadmin 或 permissions 为空 → 使用默认（开启）
  // - permissions 非空 → 解析为已勾选集合，关闭默认开关
  const { definitions: permDefs, loading: permLoading } = usePermissionDefinitions()
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(() => parsePermissions(admin.permissions))
  const [useDefaultPerm, setUseDefaultPerm] = useState(() => selectedPerms.size === 0)

  const update = (patch: Partial<EditForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }

  // 角色：超管选项仅展示且禁用，不可通过此处新建超管
  const setRole = (value: string) => {
    if (value === 'superadmin' || value === 'admin' || value === 'teacher') {
      update({ role: value })
    }
  }

  const setStatus = (value: string) => {
    if (value === 'active' || value === 'disabled') {
      update({ status: value })
    }
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (form.password && form.password.length < 6) {
      e.password = '密码至少 6 位'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload: {
        id: string
        role?: AdminRole
        realName?: string
        phone?: string
        status?: 'active' | 'disabled'
        password?: string
        permissions?: string[]
      } = {
        id: admin.id,
        role: form.role,
        realName: form.realName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        status: form.status,
      }
      if (form.password) payload.password = form.password
      // 权限：超管通配，传空数组清空自定义；否则按默认开关决定
      payload.permissions =
        form.role === 'superadmin' || useDefaultPerm ? [] : Array.from(selectedPerms)
      const result = await updateAdmin(payload)
      if (result.code === 0) {
        toast.success('账号已更新')
        onSuccess()
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`${t('admin.editAdmin')} · ${admin.username}`}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onConfirm={submit} loading={saving} confirmText={t('common.save')} />}
    >
      <div className="space-y-4">
        <Field
          label={t('admin.role')}
          required
          hint={isSuperadmin ? '当前为超管，可降级为管理员或教师' : '不可提升为超管'}
        >
          <select className={inputClass} value={form.role} onChange={(e) => setRole(e.target.value)}>
            {isSuperadmin && (
              <option value="superadmin" disabled>
                超管
              </option>
            )}
            <option value="admin">{t('admin.roleAdmin')}</option>
            <option value="teacher">{t('admin.roleTeacher')}</option>
          </select>
        </Field>
        {form.role !== 'superadmin' && (
          <Field label="权限矩阵" hint="超管拥有全部权限，无需配置">
            {permLoading ? (
              <div className="text-xs text-slate-400 py-2">加载权限定义中…</div>
            ) : (
              <PermissionMatrixEditor
                definitions={permDefs}
                useDefault={useDefaultPerm}
                onUseDefaultChange={setUseDefaultPerm}
                selected={selectedPerms}
                onSelectedChange={setSelectedPerms}
                defaultHint={defaultHintOf(form.role)}
              />
            )}
          </Field>
        )}
        <Field label={t('admin.realName')}>
          <input
            className={inputClass}
            value={form.realName}
            onChange={(e) => update({ realName: e.target.value })}
            placeholder={t('common.optional')}
          />
        </Field>
        <Field label="电话">
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder={t('common.optional')}
          />
        </Field>
        <Field label={t('admin.status')} required>
          <select className={inputClass} value={form.status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
        </Field>
        <Field
          label={t('admin.resetPassword')}
          error={errors.password}
          hint="留空则不修改密码；填写则重置为新密码（至少 6 位）"
        >
          <input
            type="password"
            className={inputClass}
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            placeholder="留空不修改"
          />
        </Field>
      </div>
    </Modal>
  )
}
