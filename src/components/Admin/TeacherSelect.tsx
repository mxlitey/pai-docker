// 老师选择器：从后端拉取老师账号列表，提供带搜索的下拉选择
// - 内部调用 listTeachers() 加载 role='teacher' 的账号
// - 选中后通过 onChange 回传 teacherId（admin.id）与 teacherName（realName || username）
// - 老师数量多时支持按姓名/用户名/手机号模糊搜索快速定位
import { useState, useEffect, useRef, useMemo } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { listTeachers } from '@/api/admin'
import { cn } from '@/utils/cn'
import { inputClass } from '@/components/ui'

interface TeacherOption {
  id: string
  username: string
  realName: string
  phone: string
}

interface TeacherSelectProps {
  value: string // teacherId（admin.id）
  onChange: (teacherId: string, teacherName: string) => void
  placeholder?: string
  className?: string
}

export function TeacherSelect({ value, onChange, placeholder, className }: TeacherSelectProps) {
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // 搜索下拉状态
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 首次挂载加载老师列表
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    listTeachers()
      .then((result) => {
        if (cancelled) return
        if (result.code === 0) {
          setTeachers(result.data?.teachers || [])
        } else {
          setLoadError(true)
        }
      })
      .catch(() => {
        if (cancelled) return
        setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => teachers.find((t) => t.id === value) || null,
    [teachers, value],
  )

  // 过滤结果：支持按 realName / username / phone 模糊匹配
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return teachers
    return teachers.filter((t) =>
      (t.realName || '').toLowerCase().includes(q) ||
      t.username.toLowerCase().includes(q) ||
      (t.phone || '').toLowerCase().includes(q),
    )
  }, [teachers, query])

  // 重置高亮到第一项
  useEffect(() => {
    setHighlight(0)
  }, [query])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // 关闭时若已选中，恢复 query 为空（显示选中态）
        if (selected) setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, selected])

  const handleSelect = (t: TeacherOption) => {
    onChange(t.id, t.realName || t.username)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && filtered[highlight]) {
        handleSelect(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  // 展示名称
  const displayName = (t: TeacherOption) => t.realName || t.username

  // 加载中 / 加载失败：用简单 select 占位，保持布局一致
  if (loading || loadError) {
    return (
      <select disabled className={cn(inputClass, 'bg-background opacity-60', className)}>
        <option value="">{loading ? '加载中...' : '加载失败'}</option>
      </select>
    )
  }

  return (
    <div className={cn('flex-1 relative', className)} ref={containerRef}>
      {/* 输入框 / 显示选中态 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selected ? displayName(selected) : ''}
          placeholder={placeholder || '搜索老师姓名 / 用户名 / 手机号'}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={inputClass}
        />
        {/* 选中态标记 */}
        {selected && !open && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/70 font-mono bg-background px-1.5 py-0.5 rounded">
            {selected.username}
          </span>
        )}
        {/* 下拉箭头 */}
        <ChevronDown
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 transition-transform pointer-events-none',
            open && 'rotate-180',
          )}
          style={{ display: selected && !open ? 'none' : 'block' }}
        />
      </div>

      {/* 下拉列表 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground/70">
              {teachers.length === 0 ? '暂无老师数据' : '未找到匹配的老师'}
            </div>
          ) : (
            filtered.map((t, idx) => (
              <div
                key={t.id}
                onClick={() => handleSelect(t)}
                onMouseEnter={() => setHighlight(idx)}
                className={cn(
                  'px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0',
                  idx === highlight ? 'bg-primary/10' : 'hover:bg-muted/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground font-medium truncate">{displayName(t)}</div>
                    <div className="text-xs text-muted-foreground/70 flex items-center gap-2 mt-0.5">
                      <span className="font-mono">{t.username}</span>
                      {t.phone && <span>· {t.phone}</span>}
                    </div>
                  </div>
                  {t.id === value && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
