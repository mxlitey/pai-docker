// SQLite 存储层入口（barrel）
// 实际实现按业务域拆分到 ./store/ 子目录，此处仅做统一 re-export，
// 以保持 `import { ... } from '../_lib/store.js'` 的调用方零改动。
export {
  getDb,
  STORE_DATA_DIR,
  STORE_DB_PATH,
  json,
} from './store/core.js'
export * from './store/students.js'
export * from './store/courses.js'
export * from './store/grades.js'
export * from './store/classes.js'
export * from './store/enrollments.js'
export * from './store/transfers.js'
export * from './store/schedules.js'
export * from './store/schedule-changes.js'
export * from './store/announcements.js'
export * from './store/admins.js'
export * from './store/audit.js'
export * from './store/reports.js'
export * from './store/backups.js'
export * from './store/feedback.js'
export * from './store/teachers.js'
export * from './store/accounts.js'
export * from './store/audit-archive.js'
