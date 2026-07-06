import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { parseDate } from '@/utils/date'

interface AnnouncementProps {
  // 公告内容（Markdown 文本，来自后端 API 异步加载），为空字符串时不渲染
  content?: string
  // 公告发布时间（ISO 字符串，来自后端 announcement.updatedAt）
  updatedAt?: string
  // 裸内容模式：仅渲染 Markdown 正文，不带 card 外壳与标题（用于嵌入弹窗等容器）
  bare?: boolean
}

// 公告栏
// - 内容由父组件通过 props 传入（异步从后端加载）
// - 内容为空（或 undefined）时不渲染
// - 支持 Markdown 渲染（GFM：表格、删除线、任务列表、自动链接等）
// - 内容过多时限定最大高度并上下滚动
// - bare=true 时仅渲染正文，便于嵌入弹窗等已有外壳的容器
// - 默认模式头部样式：图标 + 标题 + 发布时间，与公告弹窗对齐
export function Announcement({ content, updatedAt, bare = false }: AnnouncementProps) {
  if (!content) return null

  const markdown = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 标题
        h1: ({ children }) => (
          <h1 className="text-lg font-bold text-slate-800 mt-3 mb-2">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold text-slate-800 mt-3 mb-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold text-slate-700 mt-2 mb-1">{children}</h4>
        ),
        h5: ({ children }) => (
          <h5 className="text-sm font-semibold text-slate-700 mt-1 mb-1">{children}</h5>
        ),
        h6: ({ children }) => (
          <h6 className="text-xs font-semibold text-slate-700 mt-1 mb-1">{children}</h6>
        ),
        // 段落
        p: ({ children }) => <p className="my-2">{children}</p>,
        // 列表
        ul: ({ children }) => (
          <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // 强调
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-800">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        del: ({ children }) => <del className="text-slate-400">{children}</del>,
        // 链接
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:text-brand-700 underline"
          >
            {children}
          </a>
        ),
        // 引用
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-amber-300 pl-3 my-2 text-slate-500 italic">
            {children}
          </blockquote>
        ),
        // 代码
        code: ({ children, className }) => {
          // 行内代码 vs 代码块（react-markdown 用 className 区分）
          const isBlock = className?.includes('language-')
          if (isBlock) {
            return (
              <code className="block bg-slate-100 text-slate-800 rounded px-3 py-2 my-2 overflow-x-auto text-xs font-mono">
                {children}
              </code>
            )
          }
          return (
            <code className="bg-slate-100 text-rose-600 rounded px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          )
        },
        // 代码块外层 pre（react-markdown 默认 pre>code 结构，这里简化为直接由 code 渲染）
        pre: ({ children }) => <pre className="my-2">{children}</pre>,
        // 表格
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border border-slate-200 rounded">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-slate-50 text-slate-700">{children}</thead>
        ),
        tbody: ({ children }) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-slate-50">{children}</tr>,
        th: ({ children }) => (
          <th className="px-2 py-1 text-left font-semibold border-b border-slate-200">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1 border-b border-slate-100">{children}</td>
        ),
        // 水平线
        hr: () => <hr className="my-3 border-slate-200" />,
        // 任务列表项（GFM）
        input: ({ checked, ...rest }) => (
          <input
            type="checkbox"
            checked={checked}
            disabled
            className="mr-1.5 align-middle"
            {...rest}
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )

  // 裸内容模式：仅正文，供弹窗等容器嵌入
  if (bare) {
    return (
      <div className="text-sm text-slate-600 leading-relaxed announcement-md">
        {markdown}
      </div>
    )
  }

  return (
    <div className="card mb-4 overflow-hidden">
      {/* 头部：图标 + 标题 + 发布时间（与公告弹窗样式对齐） */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <svg
          className="w-4 h-4 text-amber-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 11l13-5v12L3 13v-2zm13-4.5a3.5 3.5 0 010 9M6 13v5a1 1 0 001 1h1a1 1 0 001-1v-4"
          />
        </svg>
        <span className="text-sm font-semibold text-slate-700">公告</span>
        {updatedAt && (
          <span className="text-xs text-slate-400 truncate">
            {format(parseDate(updatedAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
          </span>
        )}
      </div>
      {/* 内容：Markdown 渲染，限定最大高度，超出可上下滚动 */}
      <div className="text-sm text-slate-600 leading-relaxed max-h-80 overflow-y-auto px-4 py-3 announcement-md">
        {markdown}
      </div>
    </div>
  )
}
