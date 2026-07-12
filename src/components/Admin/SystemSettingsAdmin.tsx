// 系统设置二级页面：修改项目名称、续费预警阈值、数据备份与恢复等系统配置
import { useCallback, useEffect, useState } from 'react'
import type { BackupInfo } from '@/types'
import { getConfig } from '@/api'
import { fmtDateTimeFull } from '@/utils/tz'
import { parseCron, describeCron } from '@/utils/cron'
import {
  getSystemConfig,
  updateSystemConfig,
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
} from '@/api/admin'
import { setAppName as setAppNameConfig } from '@/config'
import {
  Button,
  EmptyState,
  LoadingBlock,
  SubPageHeader,
  confirmDialog,
  inputClass,
  toast,
} from '@/components/ui'
import { Info } from 'lucide-react'

interface SystemSettingsAdminProps {
  // 配置变更后通知父级刷新（如项目名称变更需更新页头）
  onConfigChanged?: (appName: string) => void
  onBack: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

// 文件大小格式化：B / KB / MB
function formatSize(size: number): string {
  return size < 1024
    ? size + 'B'
    : size < 1048576
      ? (size / 1024).toFixed(1) + 'KB'
      : (size / 1048576).toFixed(1) + 'MB'
}

export function SystemSettingsAdmin({
  onConfigChanged,
  onBack,
  busy,
  setBusy,
  showToast,
}: SystemSettingsAdminProps) {
  // 项目名称
  const [appName, setAppName] = useState('')
  const [originalAppName, setOriginalAppName] = useState('')
  // 续费预警阈值
  const [renewalThreshold, setRenewalThreshold] = useState(0)
  const [originalThreshold, setOriginalThreshold] = useState(0)
  // 自动备份保留天数
  const [backupKeepDays, setBackupKeepDays] = useState(7)
  const [originalKeepDays, setOriginalKeepDays] = useState(7)
  // 自动备份 cron 表达式
  const [backupCron, setBackupCron] = useState('0 3 * * *')
  const [originalBackupCron, setOriginalBackupCron] = useState('0 3 * * *')
  // cron 可读描述（前端实时预览）
  const [cronDesc, setCronDesc] = useState('')
  const [cronError, setCronError] = useState('')
  // 自动备份最大保留份数
  const [backupMaxCount, setBackupMaxCount] = useState(500)
  const [originalBackupMaxCount, setOriginalBackupMaxCount] = useState(500)
  const [loading, setLoading] = useState(true)

  // 备份列表
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backupsLoading, setBackupsLoading] = useState(true)
  const [backupCreating, setBackupCreating] = useState(false)
  const [savingKeepDays, setSavingKeepDays] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // 加载备份列表
  const loadBackups = useCallback(async () => {
    setBackupsLoading(true)
    try {
      const result = await listBackups()
      if (result.code === 0) setBackups(result.data.backups)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBackupsLoading(false)
    }
  }, [])

  // 进入页面时加载当前配置（appName + 续费阈值 + 备份保留天数）与备份列表
  useEffect(() => {
    let active = true
    Promise.allSettled([getConfig(), getSystemConfig()]).then(([appR, fullR]) => {
      if (!active) return
      if (appR.status === 'fulfilled') {
        setAppName(appR.value.appName)
        setOriginalAppName(appR.value.appName)
      } else {
        showToast('error', '加载配置失败')
      }
      if (fullR.status === 'fulfilled' && fullR.value.code === 0) {
        const cfg = fullR.value.data
        setRenewalThreshold(cfg.renewalThreshold)
        setOriginalThreshold(cfg.renewalThreshold)
        setBackupKeepDays(cfg.backupKeepDays)
        setOriginalKeepDays(cfg.backupKeepDays)
        setBackupCron(cfg.backupCron || '0 3 * * *')
        setOriginalBackupCron(cfg.backupCron || '0 3 * * *')
        setBackupMaxCount(cfg.backupMaxCount)
        setOriginalBackupMaxCount(cfg.backupMaxCount)
      } else if (fullR.status === 'rejected') {
        toast.error((fullR.reason as Error)?.message || '加载配置失败')
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    loadBackups()
    return () => {
      active = false
    }
  }, [loadBackups, showToast])

  // 顶部保存：包含项目名称 + 续费预警阈值
  const dirty = appName !== originalAppName || renewalThreshold !== originalThreshold
  const keepDaysDirty =
    backupKeepDays !== originalKeepDays ||
    backupCron !== originalBackupCron ||
    backupMaxCount !== originalBackupMaxCount

  const handleSave = async () => {
    const trimmed = appName.trim()
    if (!trimmed) {
      showToast('error', '项目名称不能为空')
      return
    }
    if (trimmed.length > 50) {
      showToast('error', '项目名称不能超过 50 个字符')
      return
    }
    const threshold = Number(renewalThreshold)
    if (!Number.isFinite(threshold) || threshold < 0) {
      showToast('error', '续费预警阈值需为不小于 0 的数值')
      return
    }
    setBusy(true)
    try {
      const result = await updateSystemConfig({
        appName: trimmed,
        renewalThreshold: threshold,
      })
      if (result.code === 0) {
        setOriginalAppName(trimmed)
        setOriginalThreshold(threshold)
        setAppNameConfig(trimmed)
        onConfigChanged?.(trimmed)
        showToast('success', '设置已更新')
      } else {
        showToast('error', result.message || '保存失败')
      }
    } catch (e) {
      showToast('error', '请求失败' + '：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    setAppName(originalAppName)
    setRenewalThreshold(originalThreshold)
  }

  // cron 表达式实时校验与描述预览
  useEffect(() => {
    const expr = backupCron.trim()
    if (!expr) {
      setCronDesc('')
      setCronError('cron 表达式不能为空')
      return
    }
    try {
      parseCron(expr)
      setCronError('')
      setCronDesc(describeCron(expr))
    } catch (e) {
      setCronDesc('')
      setCronError((e as Error).message || 'cron 表达式格式错误')
    }
  }, [backupCron])

  // 单独保存自动备份策略（保留天数 + cron + 最大份数）
  const handleSaveKeepDays = async () => {
    const n = Number(backupKeepDays)
    if (!Number.isFinite(n) || n < 1) {
      toast.error('保留天数需为不小于 1 的数值')
      return
    }
    const mc = Number(backupMaxCount)
    if (!Number.isFinite(mc) || mc < 1) {
      toast.error('最大保留份数需为不小于 1 的数值')
      return
    }
    if (cronError) {
      toast.error('cron 表达式格式错误，请修正后再保存')
      return
    }
    setSavingKeepDays(true)
    try {
      const result = await updateSystemConfig({
        backupKeepDays: n,
        backupCron: backupCron.trim(),
        backupMaxCount: mc,
      })
      if (result.code === 0) {
        setOriginalKeepDays(n)
        setBackupKeepDays(n)
        setOriginalBackupCron(backupCron.trim())
        setOriginalBackupMaxCount(mc)
        toast.success('备份策略已更新')
      } else {
        toast.error(result.message || '保存失败')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingKeepDays(false)
    }
  }

  // 立即创建备份
  const handleCreateBackup = async () => {
    setBackupCreating(true)
    try {
      const result = await createBackup()
      if (result.code === 0) {
        toast.success('备份已创建')
        await loadBackups()
      } else {
        toast.error(result.message || '备份失败')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBackupCreating(false)
    }
  }

  // 恢复备份（恢复前自动创建当前数据快照）
  const handleRestore = async (filename: string) => {
    const ok = await confirmDialog({
      title: '恢复备份',
      message: `确认从备份 ${filename} 恢复？恢复前会自动创建当前数据快照。`,
      danger: true,
      requireText: filename,
      confirmText: '确认恢复',
    })
    if (!ok) return
    setRestoring(filename)
    try {
      const result = await restoreBackup(filename)
      if (result.code === 0) {
        toast.success('已恢复，建议刷新页面')
        await loadBackups()
      } else {
        toast.error(result.message || '恢复失败')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRestoring(null)
    }
  }

  // 删除备份
  const handleDelete = async (filename: string) => {
    const ok = await confirmDialog({
      title: '删除备份',
      message: `确认删除备份 ${filename} ？`,
      danger: true,
      confirmText: '确认删除',
    })
    if (!ok) return
    setDeleting(filename)
    try {
      const result = await deleteBackup(filename)
      if (result.code === 0) {
        toast.success('已删除备份')
        await loadBackups()
      } else {
        toast.error(result.message || '删除失败')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-background">
      <SubPageHeader title={'系统设置'} onBack={onBack} className="max-w-3xl w-full mx-auto px-4 sm:px-6 pt-4">
        {dirty && !busy && (
          <Button variant="ghost" onClick={handleReset}>{'撤销'}</Button>
        )}
        <Button
          variant="primary"
          loading={busy}
          disabled={!dirty}
          onClick={handleSave}
        >
          {'保存'}
        </Button>
      </SubPageHeader>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading ? (
          <LoadingBlock />
        ) : (
          <>
            {/* 项目名称设置 */}
            <section className="card p-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-1">
                <span className="w-1 h-4 bg-primary rounded"></span>
                {'项目名称'}
              </h2>
              <p className="text-xs text-muted-foreground mb-4 ml-3">
                显示在首页标题、页脚与浏览器标签页。修改后立即生效，无需重启服务。
              </p>
              <div className="ml-3">
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="请输入项目名称"
                  maxLength={50}
                  className={inputClass}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-muted-foreground/70">
                    {appName.length}/50
                  </span>
                  {dirty && (
                    <span className="text-xs text-amber-600">未保存的修改</span>
                  )}
                </div>
              </div>
            </section>

            {/* 续费预警 */}
            <section className="card p-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-1">
                <span className="w-1 h-4 bg-primary rounded"></span>
                {'续费预警'}
              </h2>
              <p className="text-xs text-muted-foreground mb-4 ml-3">
                设置学员课时不足时的预警阈值。修改阈值后点击顶部「保存」生效。
              </p>
              <div className="ml-3 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{'续费预警阈值'}</label>
                  <input
                    type="number"
                    min={0}
                    value={renewalThreshold}
                    onChange={(e) =>
                      setRenewalThreshold(e.target.value === '' ? 0 : Number(e.target.value))
                    }
                    className={inputClass}
                  />
                  <p className="text-xs text-muted-foreground/70 mt-1.5">{'剩余课时 ≤ 此值时在学员列表标红提醒'}</p>
                </div>
              </div>
            </section>

            {/* 数据备份与恢复 */}
            <section className="card p-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-1">
                <span className="w-1 h-4 bg-primary rounded"></span>
                {'数据备份与恢复'}
              </h2>
              <p className="text-xs text-muted-foreground mb-4 ml-3">
                手动创建数据快照、恢复历史备份或调整自动备份保留策略。
              </p>
              <div className="ml-3 space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <Button variant="primary" loading={backupCreating} onClick={handleCreateBackup}>
                      {'立即备份'}
                    </Button>
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {'自动备份 Cron 表达式'}
                    </label>
                    <input
                      type="text"
                      value={backupCron}
                      onChange={(e) => setBackupCron(e.target.value)}
                      placeholder="0 3 * * *"
                      className={inputClass}
                      spellCheck={false}
                    />
                    {cronError ? (
                      <p className="text-xs text-red-500 mt-1.5">{cronError}</p>
                    ) : cronDesc ? (
                      <p className="text-xs text-emerald-600 mt-1.5">{cronDesc}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/70 mt-1.5">{'格式：分 时 日 月 周（如 0 3 * * * = 每天 3:00）'}</p>
                    )}
                  </div>
                  <div className="min-w-[140px]">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {'自动备份保留天数'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={backupKeepDays}
                      onChange={(e) =>
                        setBackupKeepDays(e.target.value === '' ? 1 : Number(e.target.value))
                      }
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-foreground/70 mt-1.5">
                      {'超过此天数的备份自动清理'}
                    </p>
                  </div>
                  <div className="min-w-[140px]">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {'最大保留份数'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={backupMaxCount}
                      onChange={(e) =>
                        setBackupMaxCount(e.target.value === '' ? 1 : Number(e.target.value))
                      }
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-foreground/70 mt-1.5">
                      {'分钟级备份时按此上限裁剪最旧备份，防止磁盘撑爆'}
                    </p>
                  </div>
                  <div>
                    <Button
                      variant="outline"
                      loading={savingKeepDays}
                      disabled={!keepDaysDirty}
                      onClick={handleSaveKeepDays}
                    >
                      {'保存'}
                    </Button>
                  </div>
                </div>

                <div className="pt-3 border-t border-border">
                  <h3 className="text-sm font-medium text-foreground mb-3">备份列表</h3>
                  {backupsLoading ? (
                    <LoadingBlock />
                  ) : backups.length === 0 ? (
                    <EmptyState
                      title={'暂无备份'}
                      description="点击「立即备份」创建第一份数据快照"
                    />
                  ) : (
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground border-b border-border">
                            <th className="py-2 px-1 font-medium">{'文件名'}</th>
                            <th className="py-2 px-1 font-medium whitespace-nowrap">{'大小'}</th>
                            <th className="py-2 px-1 font-medium whitespace-nowrap">{'创建时间'}</th>
                            <th className="py-2 px-1 font-medium text-right">{'操作'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backups.map((b) => (
                            <tr key={b.filename} className="border-b border-slate-50">
                              <td className="py-2 px-1 font-mono text-xs text-foreground break-all max-w-[220px]">
                                {b.filename}
                              </td>
                              <td className="py-2 px-1 text-muted-foreground whitespace-nowrap">
                                {formatSize(b.size)}
                              </td>
                              <td className="py-2 px-1 text-muted-foreground whitespace-nowrap">
                                {fmtDateTimeFull(b.createdAt)}
                              </td>
                              <td className="py-2 px-1 text-right">
                                <div className="inline-flex gap-2">
                                  <Button
                                    variant="outline"
                                    loading={restoring === b.filename}
                                    onClick={() => handleRestore(b.filename)}
                                  >
                                    恢复
                                  </Button>
                                  <Button
                                    variant="danger"
                                    loading={deleting === b.filename}
                                    onClick={() => handleDelete(b.filename)}
                                  >
                                    {'删除'}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 说明 */}
            <section className="card p-5 bg-background border-border">
              <div className="flex gap-2.5 text-sm text-muted-foreground">
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-muted-foreground/70" />
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-muted-foreground">配置说明</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li>· 所有配置存储在 SQLite 数据库中，容器重建后仍保留</li>
                    <li>· 项目名称修改后，已打开的页面需刷新才能看到更新</li>
                    <li>· 后续将支持更多系统配置项（如主题色、时区等）</li>
                  </ul>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
