import { getDb } from './core.js'

// ========== 公告 ==========
export async function getAnnouncement() {
  const db = getDb()
  const row = db.prepare('SELECT * FROM announcement WHERE id=1').get()
  if (!row) return { content: '', updatedAt: '' }
  return { content: row.content || '', updatedAt: row.updated_at || '' }
}

export async function saveAnnouncement(content) {
  const db = getDb()
  const payload = {
    content: String(content || ''),
    updatedAt: new Date().toISOString(),
  }
  db.prepare('UPDATE announcement SET content=?, updated_at=? WHERE id=1').run(payload.content, payload.updatedAt)
  return payload
}
