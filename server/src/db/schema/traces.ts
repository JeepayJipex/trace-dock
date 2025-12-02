import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { pgTable, varchar, text as pgText, timestamp, integer as pgInteger, index as pgIndex, uuid } from 'drizzle-orm/pg-core';
import { mysqlTable, varchar as mysqlVarchar, text as mysqlText, datetime, int, index as mysqlIndex } from 'drizzle-orm/mysql-core';

// ============================================
// SQLite Schema - Traces
// ============================================
export const sqliteTraces = sqliteTable('traces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  appName: text('app_name').notNull(),
  sessionId: text('session_id').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  durationMs: integer('duration_ms'),
  status: text('status').default('running'),
  spanCount: integer('span_count').default(0),
  errorCount: integer('error_count').default(0),
  metadata: text('metadata'), // JSON string
  createdAt: text('created_at').default("(datetime('now'))"),
}, (table) => [
  index('idx_traces_app_name').on(table.appName),
  index('idx_traces_session_id').on(table.sessionId),
  index('idx_traces_start_time').on(table.startTime),
  index('idx_traces_status').on(table.status),
]);

// ============================================
// PostgreSQL Schema - Traces
// ============================================
export const pgTraces = pgTable('traces', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  appName: varchar('app_name', { length: 255 }).notNull(),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  durationMs: pgInteger('duration_ms'),
  status: varchar('status', { length: 20 }).default('running'),
  spanCount: pgInteger('span_count').default(0),
  errorCount: pgInteger('error_count').default(0),
  metadata: pgText('metadata'), // JSON string
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  pgIndex('idx_pg_traces_app_name').on(table.appName),
  pgIndex('idx_pg_traces_session_id').on(table.sessionId),
  pgIndex('idx_pg_traces_start_time').on(table.startTime),
  pgIndex('idx_pg_traces_status').on(table.status),
]);

// ============================================
// MySQL Schema - Traces
// ============================================
export const mysqlTraces = mysqlTable('traces', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey(),
  name: mysqlVarchar('name', { length: 255 }).notNull(),
  appName: mysqlVarchar('app_name', { length: 255 }).notNull(),
  sessionId: mysqlVarchar('session_id', { length: 255 }).notNull(),
  startTime: datetime('start_time', { fsp: 3 }).notNull(),
  endTime: datetime('end_time', { fsp: 3 }),
  durationMs: int('duration_ms'),
  status: mysqlVarchar('status', { length: 20 }).default('running'),
  spanCount: int('span_count').default(0),
  errorCount: int('error_count').default(0),
  metadata: mysqlText('metadata'), // JSON string
  createdAt: datetime('created_at', { fsp: 3 }),
}, (table) => [
  mysqlIndex('idx_mysql_traces_app_name').on(table.appName),
  mysqlIndex('idx_mysql_traces_session_id').on(table.sessionId),
  mysqlIndex('idx_mysql_traces_start_time').on(table.startTime),
  mysqlIndex('idx_mysql_traces_status').on(table.status),
]);
