import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { pgTable, varchar, text as pgText, timestamp, integer as pgInteger, index as pgIndex, uuid } from 'drizzle-orm/pg-core';
import { mysqlTable, varchar as mysqlVarchar, text as mysqlText, datetime, int, index as mysqlIndex } from 'drizzle-orm/mysql-core';
import { sqliteTraces, pgTraces, mysqlTraces } from './traces';

// ============================================
// SQLite Schema - Spans
// ============================================
export const sqliteSpans = sqliteTable('spans', {
  id: text('id').primaryKey(),
  traceId: text('trace_id').notNull().references(() => sqliteTraces.id),
  parentSpanId: text('parent_span_id'),
  name: text('name').notNull(),
  operationType: text('operation_type'),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  durationMs: integer('duration_ms'),
  status: text('status').default('running'),
  metadata: text('metadata'), // JSON string
  createdAt: text('created_at').default("(datetime('now'))"),
}, (table) => [
  index('idx_spans_trace_id').on(table.traceId),
  index('idx_spans_parent_span_id').on(table.parentSpanId),
  index('idx_spans_start_time').on(table.startTime),
]);

// ============================================
// PostgreSQL Schema - Spans
// ============================================
export const pgSpans = pgTable('spans', {
  id: uuid('id').primaryKey(),
  traceId: uuid('trace_id').notNull().references(() => pgTraces.id),
  parentSpanId: uuid('parent_span_id'),
  name: varchar('name', { length: 255 }).notNull(),
  operationType: varchar('operation_type', { length: 100 }),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  durationMs: pgInteger('duration_ms'),
  status: varchar('status', { length: 20 }).default('running'),
  metadata: pgText('metadata'), // JSON string
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  pgIndex('idx_pg_spans_trace_id').on(table.traceId),
  pgIndex('idx_pg_spans_parent_span_id').on(table.parentSpanId),
  pgIndex('idx_pg_spans_start_time').on(table.startTime),
]);

// ============================================
// MySQL Schema - Spans
// ============================================
export const mysqlSpans = mysqlTable('spans', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey(),
  traceId: mysqlVarchar('trace_id', { length: 36 }).notNull().references(() => mysqlTraces.id),
  parentSpanId: mysqlVarchar('parent_span_id', { length: 36 }),
  name: mysqlVarchar('name', { length: 255 }).notNull(),
  operationType: mysqlVarchar('operation_type', { length: 100 }),
  startTime: datetime('start_time', { fsp: 3 }).notNull(),
  endTime: datetime('end_time', { fsp: 3 }),
  durationMs: int('duration_ms'),
  status: mysqlVarchar('status', { length: 20 }).default('running'),
  metadata: mysqlText('metadata'), // JSON string
  createdAt: datetime('created_at', { fsp: 3 }),
}, (table) => [
  mysqlIndex('idx_mysql_spans_trace_id').on(table.traceId),
  mysqlIndex('idx_mysql_spans_parent_span_id').on(table.parentSpanId),
  mysqlIndex('idx_mysql_spans_start_time').on(table.startTime),
]);
