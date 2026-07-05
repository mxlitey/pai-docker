interface AnnouncementProps {
  // 公告内容（来自后端 API 异步加载），为空字符串时不渲染
  content?: string
}

// 公告栏
// - 内容由父组件通过 props 传入（异步从后端加载）
// - 内容为空（或 undefined）时不渲染
// - 内容过多时限定最大高度并上下滚动
export function Announcement({ content }: AnnouncementProps) {
  if (!content) return null

  // 按换行符拆分为段落，保留空行间隔
  const lines = content.split(/\r?\n/)

  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex">
        {/* 左侧标签条 */}
        <div className="flex-shrink-0 w-1 bg-amber-400" />
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
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
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6a1 1 0 001 1v11.5a.5.5 0 01-1 0V8.83a4 4 0 00-1.564 4.853zM11 5.882A4 4 0 0116 6v0a4 4 0 014 4v6.5a.5.5 0 01-1 0V10a3 3 0 00-3-3 4 4 0 00-4 0"
              />
            </svg>
            <span className="text-sm font-semibold text-slate-700">公告</span>
          </div>
          {/* 公告内容：限定最大高度，超出可上下滚动 */}
          <div className="text-sm text-slate-600 leading-relaxed max-h-40 overflow-y-auto pr-2 whitespace-pre-wrap break-words">
            {lines.map((line, i) => (
              <div key={i} className={i > 0 ? 'mt-1' : ''}>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
