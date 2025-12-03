import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { pgTable, varchar, text as pgText, timestamp, index as pgIndex, uuid } from 'drizzle-orm/pg-core';
import { mysqlTable, varchar as mysqlVarchar, text as mysqlText, datetime, index as mysqlIndex } from 'drizzle-orm/mysql-core';

// ============================================
// SQLite Schema
// ============================================
export const sqliteLogs = sqliteTable('logs', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  appName: text('app_name').notNull(),
  sessionId: text('session_id').notNull(),
  environment: text('environment').notNull(), // JSON string
  metadata: text('metadata'), // JSON string
  stackTrace: text('stack_trace'),
  sourceLocation: text('source_location'), // JSON string
  context: text('context'), // JSON string
  errorGroupId: text('error_group_id'),
  traceId: text('trace_id'),
  spanId: text('span_id'),
  parentSpanId: text('parent_span_id'),
  createdAt: text('created_at').default("(datetime('now'))"),
}, (table) => [
  index('idx_logs_timestamp').on(table.timestamp),
  index('idx_logs_level').on(table.level),
  index('idx_logs_app_name').on(table.appName),
  index('idx_logs_session_id').on(table.sessionId),
  index('idx_logs_error_group_id').on(table.errorGroupId),
  index('idx_logs_trace_id').on(table.traceId),
  index('idx_logs_span_id').on(table.spanId),
]);

// ============================================
// PostgreSQL Schema
// ============================================
export const pgLogs = pgTable('logs', {
  id: uuid('id').primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  level: varchar('level', { length: 10 }).notNull(),
  message: pgText('message').notNull(),
  appName: varchar('app_name', { length: 255 }).notNull(),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  environment: pgText('environment').notNull(), // JSON string
  metadata: pgText('metadata'), // JSON string
  stackTrace: pgText('stack_trace'),
  sourceLocation: pgText('source_location'), // JSON string
  context: pgText('context'), // JSON string
  errorGroupId: uuid('error_group_id'),
  traceId: varchar('trace_id', { length: 255 }),
  spanId: varchar('span_id', { length: 255 }),
  parentSpanId: varchar('parent_span_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  pgIndex('idx_pg_logs_timestamp').on(table.timestamp),
  pgIndex('idx_pg_logs_level').on(table.level),
  pgIndex('idx_pg_logs_app_name').on(table.appName),
  pgIndex('idx_pg_logs_session_id').on(table.sessionId),
  pgIndex('idx_pg_logs_error_group_id').on(table.errorGroupId),
  pgIndex('idx_pg_logs_trace_id').on(table.traceId),
]);

// ============================================
// MySQL Schema
// ============================================
export const mysqlLogs = mysqlTable('logs', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey(),
  timestamp: datetime('timestamp', { fsp: 3 }).notNull(),
  level: mysqlVarchar('level', { length: 10 }).notNull(),
  message: mysqlText('message').notNull(),
  appName: mysqlVarchar('app_name', { length: 255 }).notNull(),
  sessionId: mysqlVarchar('session_id', { length: 255 }).notNull(),
  environment: mysqlText('environment').notNull(), // JSON string
  metadata: mysqlText('metadata'), // JSON string
  stackTrace: mysqlText('stack_trace'),
  sourceLocation: mysqlText('source_location'), // JSON string
  context: mysqlText('context'), // JSON string
  errorGroupId: mysqlVarchar('error_group_id', { length: 36 }),
  traceId: mysqlVarchar('trace_id', { length: 255 }),
  spanId: mysqlVarchar('span_id', { length: 255 }),
  parentSpanId: mysqlVarchar('parent_span_id', { length: 255 }),
  createdAt: datetime('created_at', { fsp: 3 }),
}, (table) => [
  mysqlIndex('idx_mysql_logs_timestamp').on(table.timestamp),
  mysqlIndex('idx_mysql_logs_level').on(table.level),
  mysqlIndex('idx_mysql_logs_app_name').on(table.appName),
  mysqlIndex('idx_mysql_logs_session_id').on(table.sessionId),
  mysqlIndex('idx_mysql_logs_error_group_id').on(table.errorGroupId),
  mysqlIndex('idx_mysql_logs_trace_id').on(table.traceId),
]);
