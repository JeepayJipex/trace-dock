import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { pgTable, varchar, text as pgText, timestamp, integer as pgInteger, index as pgIndex, uniqueIndex as pgUniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { mysqlTable, varchar as mysqlVarchar, text as mysqlText, datetime, int, index as mysqlIndex, uniqueIndex as mysqlUniqueIndex } from 'drizzle-orm/mysql-core';

// ============================================
// SQLite Schema - Error Groups
// ============================================
export const sqliteErrorGroups = sqliteTable('error_groups', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  message: text('message').notNull(),
  appName: text('app_name').notNull(),
  firstSeen: text('first_seen').notNull(),
  lastSeen: text('last_seen').notNull(),
  occurrenceCount: integer('occurrence_count').default(1),
  status: text('status').default('unreviewed'), // unreviewed, reviewed, ignored, resolved
  stackTracePreview: text('stack_trace_preview'),
  createdAt: text('created_at').default("(datetime('now'))"),
  updatedAt: text('updated_at').default("(datetime('now'))"),
}, (table) => [
  uniqueIndex('idx_error_groups_fingerprint').on(table.fingerprint),
  index('idx_error_groups_status').on(table.status),
  index('idx_error_groups_app_name').on(table.appName),
  index('idx_error_groups_last_seen').on(table.lastSeen),
  index('idx_error_groups_occurrence_count').on(table.occurrenceCount),
]);

// ============================================
// PostgreSQL Schema - Error Groups
// ============================================
export const pgErrorGroups = pgTable('error_groups', {
  id: uuid('id').primaryKey(),
  fingerprint: varchar('fingerprint', { length: 255 }).notNull(),
  message: pgText('message').notNull(),
  appName: varchar('app_name', { length: 255 }).notNull(),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull(),
  occurrenceCount: pgInteger('occurrence_count').default(1),
  status: varchar('status', { length: 20 }).default('unreviewed'),
  stackTracePreview: pgText('stack_trace_preview'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  pgUniqueIndex('idx_pg_error_groups_fingerprint').on(table.fingerprint),
  pgIndex('idx_pg_error_groups_status').on(table.status),
  pgIndex('idx_pg_error_groups_app_name').on(table.appName),
  pgIndex('idx_pg_error_groups_last_seen').on(table.lastSeen),
  pgIndex('idx_pg_error_groups_occurrence_count').on(table.occurrenceCount),
]);

// ============================================
// MySQL Schema - Error Groups
// ============================================
export const mysqlErrorGroups = mysqlTable('error_groups', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey(),
  fingerprint: mysqlVarchar('fingerprint', { length: 255 }).notNull(),
  message: mysqlText('message').notNull(),
  appName: mysqlVarchar('app_name', { length: 255 }).notNull(),
  firstSeen: datetime('first_seen', { fsp: 3 }).notNull(),
  lastSeen: datetime('last_seen', { fsp: 3 }).notNull(),
  occurrenceCount: int('occurrence_count').default(1),
  status: mysqlVarchar('status', { length: 20 }).default('unreviewed'),
  stackTracePreview: mysqlText('stack_trace_preview'),
  createdAt: datetime('created_at', { fsp: 3 }),
  updatedAt: datetime('updated_at', { fsp: 3 }),
}, (table) => [
  mysqlUniqueIndex('idx_mysql_error_groups_fingerprint').on(table.fingerprint),
  mysqlIndex('idx_mysql_error_groups_status').on(table.status),
  mysqlIndex('idx_mysql_error_groups_app_name').on(table.appName),
  mysqlIndex('idx_mysql_error_groups_last_seen').on(table.lastSeen),
  mysqlIndex('idx_mysql_error_groups_occurrence_count').on(table.occurrenceCount),
]);
