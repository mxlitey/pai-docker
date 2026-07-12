// 管理员账号管理页（仅超管使用）—— 增删改管理员账号、重置密码、启停账号
import { useCallback, useEffect, useState } from 'react'
import type { AdminUser, AdminRole, CurrentAdmin, PermissionModule } from '@/types'
import { fmtDateTimeFull } from '@/utils/tz'
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
      return 'bg-primary/10 text-primary'
    case 'admin':
      return 'bg-blue-50 text-blue-700'
    case 'teacher':
      return 'bg-muted text-muted-foreground'
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

// 时间按浏览器本地时区显示（后端存储 UTC）
function fmtDate(s?: string): string {
  return fmtDateTimeFull(s)
}

export function AdminUserAdmin({ onBack }: AdminUserAdminProps) {
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
      title: '删除管理员',
      message: `确认删除管理员「${admin.username}」？此操作不可恢复。`,
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
    <div className="min-h-full bg-background">
      <SubPageHeader title={'管理员账号'} onBack={onBack} count={admins.length} countLabel="个">
        <Button variant="primary" onClick={() => setAdding(true)}>
          {'+ '}{'新增管理员'}
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
                {'+ '}{'新增管理员'}
              </Button>
            }
          />
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left py-2 px-2 font-medium">{'用户名'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'角色'}</th>
                    <th className="text-left py-2 px-2 font-medium">{'姓名'}</th>
                    <th className="text-left py-2 px-2 font-medium">电话</th>
                    <th className="text-left py-2 px-2 font-medium">{'状态'}</th>
                    <th className="text-left py-2 px-2 font-medium">最近登录</th>
                    <th className="text-left py-2 px-2 font-medium">{'创建时间'}</th>
                    <th className="text-right py-2 px-2 font-medium">{'操作'}</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => {
                    const isSelf = !!currentAdmin && currentAdmin.id === a.id
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-2.5 px-2 font-medium text-foreground">{a.username}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${roleBadgeClass(
                              a.role,
                            )}`}
                          >
                            {roleLabel(a.role)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground">
                          {a.realName || <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground">
                          {a.phone || <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="py-2.5 px-2">
                          {a.status === 'disabled' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                              已禁用
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                              正常
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap">
                          {fmtDate(a.lastLoginAt)}
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap">
                          {fmtDate(a.createdAt)}
                        </td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditing(a)}
                            className="text-primary hover:text-primary text-xs font-medium mr-3"
                          >
                            {'编辑'}
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            disabled={isSelf}
                            title={isSelf ? '不能删除自己' : undefined}
                            className="text-destructive hover:text-destructive text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {'删除'}
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
// 始终展示所有模块的权限点（checkbox），支持按模块全选
// 提交时直接传勾选的具体权限点；为空则后端回退到角色默认权限
function PermissionMatrixEditor({
  definitions,
  selected,
  onSelectedChange,
}: {
  definitions: PermissionModule[]
  selected: Set<string>
  onSelectedChange: (next: Set<string>) => void
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
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground/70">
          勾选该账号可执行的具体权限点，未勾选则无权访问对应功能
        </p>
        {definitions.map((mod) => {
          const allKeys = mod.actions.map((a) => a.key)
          const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k))
          return (
            <div key={mod.module} className="border border-border rounded-md p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{mod.label}</span>
                <button
                  type="button"
                  onClick={() => toggleModule(mod)}
                  className="text-xs text-primary hover:text-primary font-medium"
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
                      className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePerm(a.key)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus-visible:ring-ring"
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
  // 各角色的默认权限：superadmin 为 '*'，admin/teacher 为权限点数组
  const [rolePermissions, setRolePermissions] = useState<Record<string, string | string[]>>({})
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPermissionDefinitions()
      .then((res) => {
        if (cancelled) return
        if (res.code === 0) {
          setDefinitions(res.data.definitions)
          setRolePermissions(res.data.rolePermissions)
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
  return { definitions, rolePermissions, loading }
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
  const [form, setForm] = useState<AddForm>({
    username: '',
    password: '',
    role: 'admin',
    realName: '',
    phone: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // 权限矩阵：默认勾选当前角色的默认权限，可在矩阵中自定义
  const { definitions: permDefs, rolePermissions, loading: permLoading } = usePermissionDefinitions()
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(() => new Set())

  // 权限定义加载完成后，自动勾选当前角色的默认权限
  useEffect(() => {
    if (permLoading) return
    if (Object.keys(rolePermissions).length === 0) return
    const defaultPerms = rolePermissions[form.role]
    if (Array.isArray(defaultPerms)) {
      setSelectedPerms(new Set(defaultPerms))
    }
    // 仅在 rolePermissions 加载完成时触发一次；切换角色在 setRole 中处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolePermissions, permLoading])

  // 局部更新表单，同时清除对应字段的错误
  const update = (patch: Partial<AddForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }

  // 角色：从 select 字符串收敛到联合类型，并自动勾选该角色的默认权限
  const setRole = (value: string) => {
    if (value === 'admin' || value === 'teacher') {
      update({ role: value })
      // 自动勾选该角色的默认权限
      const defaultPerms = rolePermissions[value]
      if (Array.isArray(defaultPerms)) {
        setSelectedPerms(new Set(defaultPerms))
      }
    }
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!/^[A-Za-z0-9_]{3,32}$/.test(form.username)) {
      e.username = '3-32 位字母、数字或下划线'
    }
    if (form.password.length < 8) {
      e.password = '密码至少 8 位'
    } else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      e.password = '密码需同时包含字母和数字'
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
        // 传勾选的权限点；为空时后端回退到角色默认权限
        permissions: Array.from(selectedPerms),
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
      title={'新增管理员'}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onConfirm={submit} loading={saving} confirmText={'创建'} />}
    >
      <div className="space-y-4">
        <Field label={'用户名'} required error={errors.username} hint="3-32 位字母、数字或下划线">
          <input
            className={inputClass}
            value={form.username}
            onChange={(e) => update({ username: e.target.value })}
            placeholder="如：admin01"
            autoFocus
          />
        </Field>
        <Field label={'密码'} required error={errors.password} hint="至少 8 位，需同时包含字母和数字">
          <input
            type="password"
            className={inputClass}
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            placeholder="至少 8 位，需同时包含字母和数字"
          />
        </Field>
        <Field label={'角色'} required hint="超管仅可通过系统初始化创建">
          <select className={inputClass} value={form.role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">{'管理员'}</option>
            <option value="teacher">{'教师'}</option>
          </select>
        </Field>
        <Field label="权限矩阵" hint="仅 admin/teacher 角色可配置；超管拥有全部权限">
          {permLoading ? (
            <div className="text-xs text-muted-foreground/70 py-2">加载权限定义中…</div>
          ) : (
            <PermissionMatrixEditor
              definitions={permDefs}
              selected={selectedPerms}
              onSelectedChange={setSelectedPerms}
            />
          )}
        </Field>
        <Field label={'姓名'}>
          <input
            className={inputClass}
            value={form.realName}
            onChange={(e) => update({ realName: e.target.value })}
            placeholder={'选填'}
          />
        </Field>
        <Field label="电话">
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder={'选填'}
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
  // 权限矩阵：加载时解析 admin.permissions 为已勾选集合
  // - superadmin：通配，无需配置
  // - 其他角色：解析自定义权限；为空时自动加载该角色的默认权限
  const { definitions: permDefs, rolePermissions, loading: permLoading } = usePermissionDefinitions()
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(() => parsePermissions(admin.permissions))

  // 权限定义加载完成后：若 admin 无自定义权限，自动勾选当前角色的默认权限
  useEffect(() => {
    if (permLoading) return
    if (Object.keys(rolePermissions).length === 0) return
    // 已有自定义权限则保留
    if (selectedPerms.size > 0) return
    if (form.role === 'admin' || form.role === 'teacher') {
      const defaultPerms = rolePermissions[form.role]
      if (Array.isArray(defaultPerms)) {
        setSelectedPerms(new Set(defaultPerms))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolePermissions, permLoading])

  const update = (patch: Partial<EditForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }

  // 角色：超管选项仅展示且禁用，不可通过此处新建超管
  // 切换到 admin/teacher 时自动勾选该角色的默认权限
  const setRole = (value: string) => {
    if (value === 'superadmin' || value === 'admin' || value === 'teacher') {
      update({ role: value })
      // 切换到 admin/teacher 时自动勾选该角色的默认权限
      if (value === 'admin' || value === 'teacher') {
        const defaultPerms = rolePermissions[value]
        if (Array.isArray(defaultPerms)) {
          setSelectedPerms(new Set(defaultPerms))
        }
      }
    }
  }

  const setStatus = (value: string) => {
    if (value === 'active' || value === 'disabled') {
      update({ status: value })
    }
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (form.password) {
      if (form.password.length < 8) {
        e.password = '密码至少 8 位'
      } else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
        e.password = '密码需同时包含字母和数字'
      }
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
      // 权限：超管通配传空数组；否则传勾选的权限点（为空时后端回退到角色默认）
      payload.permissions =
        form.role === 'superadmin' ? [] : Array.from(selectedPerms)
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
      title={`${'编辑管理员'} · ${admin.username}`}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onConfirm={submit} loading={saving} confirmText={'保存'} />}
    >
      <div className="space-y-4">
        <Field
          label={'角色'}
          required
          hint={isSuperadmin ? '当前为超管，可降级为管理员或教师' : '不可提升为超管'}
        >
          <select className={inputClass} value={form.role} onChange={(e) => setRole(e.target.value)}>
            {isSuperadmin && (
              <option value="superadmin" disabled>
                超管
              </option>
            )}
            <option value="admin">{'管理员'}</option>
            <option value="teacher">{'教师'}</option>
          </select>
        </Field>
        {form.role !== 'superadmin' && (
          <Field label="权限矩阵" hint="超管拥有全部权限，无需配置">
            {permLoading ? (
              <div className="text-xs text-muted-foreground/70 py-2">加载权限定义中…</div>
            ) : (
              <PermissionMatrixEditor
                definitions={permDefs}
                selected={selectedPerms}
                onSelectedChange={setSelectedPerms}
              />
            )}
          </Field>
        )}
        <Field label={'姓名'}>
          <input
            className={inputClass}
            value={form.realName}
            onChange={(e) => update({ realName: e.target.value })}
            placeholder={'选填'}
          />
        </Field>
        <Field label="电话">
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder={'选填'}
          />
        </Field>
        <Field label={'状态'} required>
          <select className={inputClass} value={form.status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
        </Field>
        <Field
          label={'重置密码'}
          error={errors.password}
          hint="留空则不修改密码；填写则重置为新密码（至少 8 位，需同时包含字母和数字）"
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
