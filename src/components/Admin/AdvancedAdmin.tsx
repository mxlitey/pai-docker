import type { ReactNode } from 'react'

interface AdvancedAdminProps {
  // 顶部返回按钮
  onBack: () => void
  // 数据管理
  onSeed: () => void
  onClear: () => void
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
    onSeed,
    onClear,
    busy,
    announcementText,
    setAnnouncementText,
    announcementUpdatedAt,
    onSaveAnnouncement,
    children,
  } = props

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
          <span className="text-xs text-slate-400 hidden sm:block">数据管理 · 公告设置</span>
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

        {/* 数据管理 */}
        <section className="card p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-brand-500 rounded"></span>
            数据管理
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 测试数据 */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-sm text-slate-700">导入测试数据</div>
                  <div className="text-xs text-slate-400 mt-1">
                    写入 8 名示例学员及 7 月排课，用于演示验证
                  </div>
                </div>
              </div>
              <button
                onClick={onSeed}
                disabled={busy}
                className="btn-primary w-full mt-2"
              >
                {busy ? '处理中…' : '导入测试数据'}
              </button>
            </div>

            {/* 清空数据 */}
            <div className="border border-rose-200 rounded-lg p-4 bg-rose-50/30">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-sm text-rose-700">一键清空所有数据</div>
                  <div className="text-xs text-rose-400 mt-1">
                    删除 Blob 中全部学员与排课，不可恢复
                  </div>
                </div>
              </div>
              <button
                onClick={onClear}
                disabled={busy}
                className="btn w-full mt-2 bg-rose-600 text-white hover:bg-rose-700"
              >
                {busy ? '处理中…' : '清空全部数据'}
              </button>
            </div>
          </div>
        </section>

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
            公告内容将展示在首页与日历页中学员信息与日历之间。支持多行文本（按回车换行）。
            内容为空时公告栏自动隐藏。保存后所有用户下次加载页面时即可看到最新公告。
          </div>

          <textarea
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            placeholder="请输入公告内容，例如：&#10;1. 7 月 15 日（周一）全天停课，请学员按补课通知安排时间。&#10;2. 暑期班报名已开启，详情咨询前台。"
            maxLength={5000}
            className="w-full h-48 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-400">
              {announcementText.length}/5000 字
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
