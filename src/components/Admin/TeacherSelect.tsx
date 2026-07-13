// 老师选择器：从后端拉取老师账号列表，提供下拉选择
// - 内部调用 listTeachers() 加载 role='teacher' 的账号
// - 选中后通过 onChange 回传 teacherId（admin.id）与 teacherName（realName || username）
// - 保持简单：用原生 <select>，老师数量通常不多
import { useEffect, useState } from 'react'
import { listTeachers } from '@/api/admin'
import { cn } from '@/utils/cn'
import { inputClass } from '@/components/ui'

interface TeacherSelectProps {
  value: string // teacherId（admin.id）
  onChange: (teacherId: string, teacherName: string) => void
  placeholder?: string
  className?: string
}

export function TeacherSelect({ value, onChange, placeholder, className }: TeacherSelectProps) {
  const [teachers, setTeachers] = useState<{ id: string; username: string; realName: string; phone: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

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

  // 加载中
  if (loading) {
    return (
      <select disabled className={cn(inputClass, 'bg-background opacity-60', className)}>
        <option value="">加载中...</option>
      </select>
    )
  }

  // 加载失败
  if (loadError) {
    return (
      <select disabled className={cn(inputClass, 'bg-background opacity-60', className)}>
        <option value="">加载失败</option>
      </select>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        const id = e.target.value
        const t = teachers.find((x) => x.id === id)
        onChange(id, t ? (t.realName || t.username) : '')
      }}
      className={cn(inputClass, 'bg-background', className)}
    >
      <option value="">{placeholder || '不指定老师'}</option>
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.realName || t.username}
        </option>
      ))}
    </select>
  )
}
