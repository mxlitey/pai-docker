// 公开搜索页（#search）—— 旧首页的"类百度"布局
// - 居中展示项目名称（appName 由 App.tsx 运行时从后端加载后传入）
// - 学员搜索框：选中后启用「查看排课」按钮
// - 入口按钮：查看排课 → 跳转家长端 ?s=学员id（走手机号后4位验证）
// - 公告栏：异步从后端加载，空内容不展示
// - 页脚：项目名称 + GitHub 项目链接
import { useEffect, useState } from 'react'
import { SearchBar } from '@/components/SearchBar'
import { Announcement } from '@/components/Announcement/Announcement'
import { GITHUB_URL } from '@/config'
import { searchStudents, getAnnouncement, type AnnouncementInfo } from '@/api'
import type { Student } from '@/types'
import { Spinner } from '@/components/ui'

interface PublicSearchProps {
  appName: string
  // 点击「查看排课」按钮：由 App.tsx 跳转家长端 ?s=学员id
  onViewSchedule: (student: Student) => void
}

export function PublicSearch({ appName, onViewSchedule }: PublicSearchProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [announcement, setAnnouncement] = useState<AnnouncementInfo>({ content: '', updatedAt: '' })
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [initialQuery, setInitialQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // 加载学员列表（供 SearchBar 本地过滤）+ 公告
  // 用 allSettled 独立处理：学员列表需鉴权，未登录时会 401 失败，不应阻塞公告显示
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [listRes, infoRes] = await Promise.allSettled([
        searchStudents(''),
        getAnnouncement(),
      ])
      if (cancelled) return
      if (listRes.status === 'fulfilled') setStudents(listRes.value)
      // 学员列表加载失败（如 401）不阻塞，搜索框仍可用（只是无候选）
      if (infoRes.status === 'fulfilled') setAnnouncement(infoRes.value)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const canView = !!selectedStudent

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      {/* 主体内容：垂直水平居中 */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* 项目名称 */}
        <div className="text-center mb-8 select-none">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight">
            {appName}
          </h1>
        </div>

        {/* 搜索框（加载完成前展示 spinner） */}
        <div className="w-full max-w-xl mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Spinner className="w-5 h-5 text-muted-foreground" />
            </div>
          ) : (
            <SearchBar
              onSelectStudent={(s) => {
                setSelectedStudent(s)
                setInitialQuery(s.name)
              }}
              students={students}
              initialValue={initialQuery}
              onQueryChange={(q) => {
                setInitialQuery(q)
                if (!q) setSelectedStudent(null)
              }}
            />
          )}
        </div>

        {/* 入口按钮：仅保留「查看排课」 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => selectedStudent && onViewSchedule(selectedStudent)}
            disabled={!canView}
            className={canView ? 'btn-primary px-5 py-2' : 'btn-primary px-5 py-2 opacity-50 cursor-not-allowed'}
            title={canView ? `查看「${selectedStudent?.name}」的排课` : '请先搜索并选中学员'}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            查看排课
          </button>
        </div>

        {/* 公告栏（内容为空时不展示） */}
        <div className="w-full max-w-xl mt-8">
          <Announcement content={announcement.content} updatedAt={announcement.updatedAt} />
        </div>
      </main>

      {/* 页脚 */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <span>{appName}</span>
        {GITHUB_URL && (
          <>
            <span className="mx-2">·</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 align-middle"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.72-4.04-1.59-4.04-1.59-.55-1.38-1.34-1.75-1.34-1.75-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.23 1.85 1.23 1.07 1.8 2.81 1.28 3.5.98.11-.77.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.23-3.17-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.21a11.6 11.6 0 016 0c2.3-1.53 3.3-1.21 3.3-1.21.65 1.65.24 2.87.12 3.17.77.83 1.23 1.88 1.23 3.17 0 4.53-2.81 5.52-5.49 5.81.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .32.21.7.82.58A12.04 12.04 0 0024 12.29C24 5.78 18.63.5 12 .5z" />
              </svg>
              GitHub
            </a>
          </>
        )}
      </footer>
    </div>
  )
}
