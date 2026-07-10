import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fmtDateTime } from '@/utils/tz'
import { Button, SubPageHeader } from '@/components/ui'

interface AnnouncementAdminProps {
  // 顶部返回按钮
  onBack: () => void
  busy: boolean
  // 公告设置
  announcementText: string
  setAnnouncementText: (v: string) => void
  announcementUpdatedAt: string
  onSaveAnnouncement: () => void
}

// 公告管理页 —— 编辑并预览首页公告内容（支持 Markdown）
export function AnnouncementAdmin({
  onBack,
  busy,
  announcementText,
  setAnnouncementText,
  announcementUpdatedAt,
  onSaveAnnouncement,
}: AnnouncementAdminProps) {
  // 公告编辑/预览切换
  const [announceTab, setAnnounceTab] = useState<'edit' | 'preview'>('edit')

  // 格式化更新时间（后端存储 UTC，按浏览器本地时区显示）
  const updatedAtLabel = announcementUpdatedAt
    ? fmtDateTime(announcementUpdatedAt)
    : ''

  return (
    <div className="min-h-screen bg-slate-50">
      <SubPageHeader title={'公告管理'} onBack={onBack} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* 公告设置 */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 bg-brand-500 rounded"></span>
              {'公告内容'}
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
              {'编辑'}
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
              {'预览'}
            </button>
          </div>

          {/* 编辑区 / 预览区 */}
          {announceTab === 'edit' ? (
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder={'请输入公告内容（支持 Markdown）'}
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
            <Button
              variant="primary"
              loading={busy}
              onClick={onSaveAnnouncement}
            >
              {'保存公告'}
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
