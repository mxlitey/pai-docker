import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { Student } from '@/types'
import { searchStudents } from '@/api'
import { cn } from '@/utils/cn'

interface SearchBarProps {
  onSelectStudent: (student: Student) => void
  // 可选：传入学员列表，本地过滤（避免 API 调用，适用于后台管理页已加载全部学员的场景）
  students?: Student[]
  // 初始输入框内容（用于首页刷新后回显上次搜索的学员名）
  initialValue?: string
  // 输入内容变化回调（清空时父级可据此禁用「查看排课」按钮）
  onQueryChange?: (query: string) => void
  // 容器自定义类名（用于覆盖默认宽度等，如 "max-w-none" 表示不限宽）
  containerClassName?: string
}

export function SearchBar({ onSelectStudent, students, initialValue, onQueryChange, containerClassName }: SearchBarProps) {
  const [query, setQuery] = useState(initialValue || '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputWrapperRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()
  const requestIdRef = useRef(0)

  // 本地过滤模式：从传入的 students 列表中按姓名模糊匹配
  const localResults = useMemo(() => {
    if (!students) return null // 未传入 students，走 API 模式
    const q = query.trim().toLowerCase()
    if (!q) return []
    return students.filter((s) =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.grade || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q),
    )
  }, [students, query])

  // 防抖搜索（仅在 API 模式下使用）
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setErrorMsg('')
      setOpen(false)
      return
    }
    const currentRequestId = ++requestIdRef.current
    setLoading(true)
    try {
      const result = await searchStudents(q.trim())
      if (requestIdRef.current !== currentRequestId) return
      setErrorMsg('')
      setOpen(true)
      setHighlightIndex(-1)
      void result
    } catch (e) {
      if (requestIdRef.current !== currentRequestId) return
      setErrorMsg((e as Error).message || '搜索失败')
      setOpen(true)
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false)
      }
    }
  }, [])

  const handleInput = (value: string) => {
    setQuery(value)
    onQueryChange?.(value)
    // 本地模式：无需防抖搜索
    if (students) {
      if (value.trim()) {
        setOpen(true)
        setHighlightIndex(-1)
        setErrorMsg('')
      } else {
        setOpen(false)
      }
      return
    }
    // API 模式：防抖搜索
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => doSearch(value), 250)
  }

  const handleSelect = (student: Student) => {
    setQuery(student.name)
    setOpen(false)
    onSelectStudent(student)
  }

  // 当前结果列表（本地模式或 API 模式）
  const results: Student[] = localResults !== null ? localResults : []

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0) {
        handleSelect(results[highlightIndex])
      } else if (results.length > 0) {
        handleSelect(results[0])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // 计算下拉框位置
  const updateDropdownPos = useCallback(() => {
    if (!inputWrapperRef.current) return
    const rect = inputWrapperRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [])

  useLayoutEffect(() => {
    if (open) updateDropdownPos()
  }, [open, updateDropdownPos])

  useEffect(() => {
    if (!open) return
    const handler = () => updateDropdownPos()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open, updateDropdownPos])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  const renderDropdown = () => {
    if (!open || !dropdownPos) return null
    const style: React.CSSProperties = {
      position: 'fixed',
      top: dropdownPos.top,
      left: dropdownPos.left,
      width: dropdownPos.width,
      zIndex: 9999,
    }
    if (results.length > 0) {
      return createPortal(
        <ul
          ref={dropdownRef as React.RefObject<HTMLUListElement>}
          style={style}
          className="bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto"
        >
          {results.map((student, index) => (
            <li
              key={student.id}
              onClick={() => handleSelect(student)}
              onMouseEnter={() => setHighlightIndex(index)}
              className={cn(
                'flex items-center justify-between px-4 py-2.5 cursor-pointer text-sm transition-colors',
                highlightIndex === index ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{student.name}</span>
                {student.grade && (
                  <span className="text-xs text-slate-400">{student.grade}</span>
                )}
              </div>
            </li>
          ))}
        </ul>,
        document.body,
      )
    }
    if (!loading && query.trim()) {
      return createPortal(
        <div
          ref={dropdownRef as React.RefObject<HTMLDivElement>}
          style={style}
          className="bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 text-sm text-slate-400"
        >
          {errorMsg || '未找到匹配的学员'}
        </div>,
        document.body,
      )
    }
    return null
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', containerClassName)}>
      <div ref={inputWrapperRef} className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={'输入学员姓名搜索…'}
          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {renderDropdown()}
    </div>
  )
}
