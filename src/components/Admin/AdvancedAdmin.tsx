import { useState } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AdvancedAdminProps {
  // 顶部返回按钮
  onBack: () => void
  busy: boolean
  // 公告设置
  announcementText: string
  setAnnouncementText: (v: string) => void
  announcementUpdatedAt: string
  onSaveAnnouncement: () => void
  // 可选：额外提示节点（如 toast 由父级管理）
  children?: ReactNode
}

export function AdvancedAdmin(props: AdvancedAdminProps) {
  const {
    onBack,
    busy,
    announcementText,
    setAnnouncementText,
    announcementUpdatedAt,
    onSaveAnnouncement,
    children,
  } = props

  // 公告编辑/预览切换
  const [announceTab, setAnnounceTab] = useState<'edit' | 'preview'>('edit')

  // 格式化更新时间
  const updatedAtLabel = announcementUpdatedAt
    ? new Date(announcementUpdatedAt).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回后台
            </button>
            <span className="text-slate-300">/</span>
            <h1 className="text-base font-semibold text-slate-800">进阶管理</h1>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">公告设置 · 数据管理</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* 危险操作警告横幅 */}
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
          <div className="text-sm text-amber-800">
            <div className="font-semibold mb-1">⚠ 非专业人员禁止操作</div>
            <p className="text-xs leading-relaxed">
              本页面操作将直接修改 Blob 存储中的全局数据，可能导致数据丢失或不可恢复的损坏。
              仅在明确知晓每个操作后果的情况下使用。如不确定，请返回后台管理页使用「新增排课」「编辑排课」等安全操作。
            </p>
          </div>
        </div>

        {/* 公告设置 */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-400 rounded"></span>
              公告设置
            </h2>
            {updatedAtLabel && (
              <span className="text-xs text-slate-400">最近更新：{updatedAtLabel}</span>
            )}
          </div>

          <div className="text-xs text-slate-500 mb-2 leading-relaxed">
            公告内容将展示在首页公告栏。支持 Markdown 语法（标题、列表、表格、链接、加粗、删除线、任务列表等）。
            内容为空时公告栏自动隐藏。保存后所有用户下次加载页面时即可看到最新公告。
          </div>

          {/* 编辑 / 预览 切换 */}
          <div className="flex items-center gap-1 mb-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setAnnounceTab('edit')}
              className={
                announceTab === 'edit'
                  ? 'px-3 py-1.5 text-xs font-medium text-brand-600 border-b-2 border-brand-500 -mb-px'
                  : 'px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700'
              }
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => setAnnounceTab('preview')}
              className={
                announceTab === 'preview'
                  ? 'px-3 py-1.5 text-xs font-medium text-brand-600 border-b-2 border-brand-500 -mb-px'
                  : 'px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700'
              }
            >
              预览
            </button>
          </div>

          {/* 编辑区 / 预览区 */}
          {announceTab === 'edit' ? (
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder={'请输入公告内容，支持 Markdown：\n\n## 通知\n- 7 月 15 日（周一）全天停课\n- 暑期班报名已开启，详情咨询前台\n\n> 如有疑问请联系 [前台](https://example.com)'}
              maxLength={5000}
              className="w-full h-72 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y font-mono"
            />
          ) : (
            <div className="w-full h-72 px-3 py-2 text-sm border border-slate-200 rounded-md overflow-y-auto bg-white announcement-md">
              {announcementText.trim() ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-lg font-bold text-slate-800 mt-3 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold text-slate-800 mt-3 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-sm font-semibold text-slate-700 mt-2 mb-1">{children}</h4>,
                    p: ({ children }) => <p className="my-2">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    del: ({ children }) => <del className="text-slate-400">{children}</del>,
                    a: ({ children, href }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 underline">
                        {children}
                      </a>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-amber-300 pl-3 my-2 text-slate-500 italic">{children}</blockquote>
                    ),
                    code: ({ children, className }) => {
                      const isBlock = className?.includes('language-')
                      if (isBlock) {
                        return <code className="block bg-slate-100 text-slate-800 rounded px-3 py-2 my-2 overflow-x-auto text-xs font-mono">{children}</code>
                      }
                      return <code className="bg-slate-100 text-rose-600 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                    },
                    pre: ({ children }) => <pre className="my-2">{children}</pre>,
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full text-xs border border-slate-200 rounded">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-slate-50 text-slate-700">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
                    th: ({ children }) => <th className="px-2 py-1 text-left font-semibold border-b border-slate-200">{children}</th>,
                    td: ({ children }) => <td className="px-2 py-1 border-b border-slate-100">{children}</td>,
                    hr: () => <hr className="my-3 border-slate-200" />,
                    input: ({ checked, ...rest }) => (
                      <input type="checkbox" checked={checked} disabled className="mr-1.5 align-middle" {...rest} />
                    ),
                  }}
                >
                  {announcementText}
                </ReactMarkdown>
              ) : (
                <div className="text-slate-400 italic">暂无内容，切换到「编辑」标签输入公告</div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-400">
              {announcementText.length}/5000 字 · 支持 Markdown
            </span>
            <button
              onClick={onSaveAnnouncement}
              disabled={busy}
              className="btn-primary"
            >
              {busy ? '保存中…' : '保存公告'}
            </button>
          </div>
        </section>

        {children}
      </main>
    </div>
  )
}
