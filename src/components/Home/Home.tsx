import { SearchBar } from '@/components/SearchBar'
import { Announcement } from '@/components/Announcement/Announcement'
import { APP_NAME, FOOTER_TEXT, GITHUB_URL } from '@/config'
import type { Student } from '@/types'

interface HomeProps {
  announcement?: string
  onSelectStudent: (student: Student) => void
  onEnterCalendar: () => void
  onEnterAdmin: () => void
}

// 简洁首页（类百度）
// - 居中展示项目名称（来自环境变量 VITE_APP_NAME）
// - 学员搜索框：选中后直接进入日历页查看排课
// - 入口按钮：进入日历 / 后台管理
// - 页脚：排课系统 + GitHub 项目链接
export function Home({ announcement, onSelectStudent, onEnterCalendar, onEnterAdmin }: HomeProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* 主体内容：垂直水平居中 */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* 项目名称 */}
        <div className="text-center mb-8 select-none">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500 text-white mb-5 shadow-lg shadow-brand-500/20">
            <svg
              className="w-9 h-9"
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
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-800 tracking-tight">
            {APP_NAME}
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-3">
            日历视角 · 学员排课查询
          </p>
        </div>

        {/* 搜索框 */}
        <div className="w-full max-w-xl mb-6">
          <SearchBar onSelectStudent={onSelectStudent} />
        </div>

        {/* 入口按钮 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onEnterCalendar}
            className="btn-primary px-5 py-2"
            title="进入日历查看排课"
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
            进入日历
          </button>
          <button
            onClick={onEnterAdmin}
            className="btn-ghost border border-slate-200 bg-white px-5 py-2"
            title="后台管理"
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            后台管理
          </button>
        </div>

        {/* 公告栏（内容为空时不展示） */}
        <div className="w-full max-w-xl mt-8">
          <Announcement content={announcement} />
        </div>
      </main>

      {/* 页脚 */}
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        <span>{FOOTER_TEXT}</span>
        {GITHUB_URL && (
          <>
            <span className="mx-2">·</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-brand-500 transition-colors inline-flex items-center gap-1 align-middle"
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
