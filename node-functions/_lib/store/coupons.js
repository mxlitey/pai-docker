import { getDb } from './core.js'
import { genCouponId } from '../id.js'

// ========== 优惠券 coupons ==========
export async function getCoupons({ status } = {}) {
  const db = getDb()
  let sql = 'SELECT * FROM coupons WHERE 1=1'
  const params = []
  if (status) { sql += ' AND status=?'; params.push(status) }
  sql += ' ORDER BY created_at DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, type: r.type, value: r.value,
    minAmount: r.min_amount, validFrom: r.valid_from, validTo: r.valid_to,
    usageLimit: r.usage_limit, usedCount: r.used_count, status: r.status,
    remark: r.remark, createdAt: r.created_at,
  }))
}

export async function addCoupon(coupon) {
  const db = getDb()
  const id = genCouponId()
  db.prepare(`INSERT INTO coupons
    (id, code, name, type, value, min_amount, valid_from, valid_to, usage_limit, used_count, status, remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, coupon.code || id, coupon.name || '', coupon.type || 'discount',
    Math.max(0, Number(coupon.value) || 0), Math.max(0, Number(coupon.minAmount) || 0),
    coupon.validFrom || '', coupon.validTo || '',
    Math.max(0, Math.floor(Number(coupon.usageLimit) || 0)), 0,
    coupon.status || 'active', coupon.remark || '',
  )
  return { id, coupon: { ...coupon, id } }
}

export async function updateCoupon(id, patch) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM coupons WHERE id=?').get(id)
  if (!old) throw new Error('优惠券不存在')
  db.prepare(`UPDATE coupons SET name=?, type=?, value=?, min_amount=?, valid_from=?, valid_to=?, usage_limit=?, status=?, remark=? WHERE id=?`).run(
    patch.name !== undefined ? patch.name : old.name,
    patch.type !== undefined ? patch.type : old.type,
    patch.value !== undefined ? Math.max(0, Number(patch.value) || 0) : old.value,
    patch.minAmount !== undefined ? Math.max(0, Number(patch.minAmount) || 0) : old.min_amount,
    patch.validFrom !== undefined ? patch.validFrom : old.valid_from,
    patch.validTo !== undefined ? patch.validTo : old.valid_to,
    patch.usageLimit !== undefined ? Math.max(0, Math.floor(Number(patch.usageLimit) || 0)) : old.usage_limit,
    patch.status !== undefined ? patch.status : old.status,
    patch.remark !== undefined ? patch.remark : old.remark,
    id,
  )
  return { id }
}

export async function deleteCoupon(id) {
  const db = getDb()
  db.prepare('DELETE FROM coupons WHERE id=?').run(id)
  return { ok: true }
}
