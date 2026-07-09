import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Student } from '@/types'
import { searchStudents } from '@/api'
import { cn } from '@/utils/cn'

interface SearchBarProps {
  onSelectStudent: (student: Student) => void
  // 初始输入框内容（用于首页刷新后回显上次搜索的学员名）
  initialValue?: string
  // 输入内容变化回调（清空时父级可据此禁用「查看排课」按钮）
  onQueryChange?: (query: string) => void
}

export function SearchBar({ onSelectStudent, initialValue, onQueryChange }: SearchBarProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(initialValue || '')
  const [results, setResults] = useState<Student[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()
  // 请求序号：仅最新请求的结果会被采纳，避免竞态覆盖
  const requestIdRef = useRef(0)

  // 防抖搜索
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    const currentRequestId = ++requestIdRef.current
    setLoading(true)
    try {
      const students = await searchStudents(q.trim())
      // 仅当本次请求仍是最新请求时才更新结果，避免旧请求覆盖新请求
      if (requestIdRef.current !== currentRequestId) return
      setResults(students)
      setOpen(true)
      setHighlightIndex(-1)
    } catch {
      if (requestIdRef.current !== currentRequestId) return
      setResults([])
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false)
      }
    }
  }, [])

  const handleInput = (value: string) => {
    setQuery(value)
    onQueryChange?.(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => doSearch(value), 250)
  }

  const handleSelect = (student: Student) => {
    setQuery(student.name)
    setOpen(false)
    onSelectStudent(student)
  }

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

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 卸载时清理防抖定时器，避免 setState on unmounted
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
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
          placeholder={t('home.searchInputPlaceholder')}
          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
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
        </ul>
      )}

      {open && !loading && results.length === 0 && query.trim() && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 text-sm text-slate-400">
          {t('home.noMatch')}
        </div>
      )}
    </div>
  )
}
