// 报表查询 API（superadmin/admin/teacher）
// GET /api/reports?type=<reportType>&startDate=&endDate=&groupBy=
// type 取值：revenue|hours-consumption|hours-balance|attendance-rate|transfers|enrollment-stats
import {
  getReportRevenue,
  getReportHoursConsumption,
  getReportHoursBalance,
  getReportAttendanceRate,
  getReportTransfers,
  getReportEnrollmentStats,
  json,
} from '../_lib/store.js'
import { requirePermission } from '../_lib/auth.js'

const REPORT_HANDLERS = {
  revenue: getReportRevenue,
  'hours-consumption': getReportHoursConsumption,
  'hours-balance': getReportHoursBalance,
  'attendance-rate': getReportAttendanceRate,
  transfers: getReportTransfers,
  'enrollment-stats': getReportEnrollmentStats,
}

export default async function onRequestGet(context) {
  const fail = await requirePermission(context, 'reports:view')
  if (fail) return fail
  const url = new URL(context.request.url)
  const type = url.searchParams.get('type') || ''
  const handler = REPORT_HANDLERS[type]
  if (!handler) {
    return json({ code: 1, message: '不支持的报表类型', data: null }, 400)
  }
  const params = {
    startDate: url.searchParams.get('startDate') || '',
    endDate: url.searchParams.get('endDate') || '',
    groupBy: url.searchParams.get('groupBy') || '',
  }
  try {
    const result = await handler(params)
    return json({ code: 0, message: 'ok', data: result })
  } catch (e) {
    console.error(`[reports] ${type} 查询异常:`, e?.message || String(e))
    return json({ code: 1, message: '报表查询失败：' + (e?.message || '未知错误'), data: null }, 500)
  }
}
