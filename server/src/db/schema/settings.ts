import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { pgTable, varchar, text as pgText, timestamp } from 'drizzle-orm/pg-core';
import { mysqlTable, varchar as mysqlVarchar, text as mysqlText, datetime } from 'drizzle-orm/mysql-core';

// ============================================
// SQLite Schema - Settings
// ============================================
export const sqliteSettings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default("(datetime('now'))"),
});

// ============================================
// PostgreSQL Schema - Settings
// ============================================
export const pgSettings = pgTable('settings', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: pgText('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================
// MySQL Schema - Settings
// ============================================
export const mysqlSettings = mysqlTable('settings', {
  key: mysqlVarchar('key', { length: 255 }).primaryKey(),
  value: mysqlText('value').notNull(),
  updatedAt: datetime('updated_at', { fsp: 3 }),
});
