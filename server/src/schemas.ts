import { z } from 'zod';

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export const EnvironmentInfoSchema = z.object({
  type: z.enum(['browser', 'node', 'tauri', 'unknown']),
  userAgent: z.string().optional(),
  url: z.string().optional(),
  nodeVersion: z.string().optional(),
  platform: z.string().optional(),
  arch: z.string().optional(),
  tauriVersion: z.string().optional(),
});

export const LogEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.iso.datetime(),
  level: LogLevelSchema,
  message: z.string(),
  appName: z.string(),
  sessionId: z.string(),
  environment: EnvironmentInfoSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  stackTrace: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  errorGroupId: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  parentSpanId: z.string().optional(),
});

export const LogQuerySchema = z.object({
  level: LogLevelSchema.optional(),
  appName: z.string().optional(),
  sessionId: z.string().optional(),
  search: z.string().optional(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// Error group status enum
export const ErrorGroupStatusSchema = z.enum(['unreviewed', 'reviewed', 'ignored', 'resolved']);

// Error group schema
export const ErrorGroupSchema = z.object({
  id: z.string().uuid(),
  fingerprint: z.string(),
  message: z.string(),
  appName: z.string(),
  firstSeen: z.iso.datetime(),
  lastSeen: z.iso.datetime(),
  occurrenceCount: z.number(),
  status: ErrorGroupStatusSchema,
  stackTracePreview: z.string().optional(),
});

export const ErrorGroupQuerySchema = z.object({
  appName: z.string().optional(),
  status: ErrorGroupStatusSchema.optional(),
  search: z.string().optional(),
  sortBy: z.enum(['last_seen', 'first_seen', 'occurrence_count']).default('last_seen'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export const UpdateErrorGroupStatusSchema = z.object({
  status: ErrorGroupStatusSchema,
});

// Trace status enum
export const TraceStatusSchema = z.enum(['ok', 'error', 'unset']);

// Span schema
export const SpanSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  operationName: z.string(),
  serviceName: z.string(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime().nullable(),
  durationMs: z.number().nullable(),
  status: TraceStatusSchema,
  tags: z.record(z.string(), z.unknown()).optional(),
  logs: z.array(z.object({
    timestamp: z.iso.datetime(),
    message: z.string(),
    level: LogLevelSchema.optional(),
  })).optional(),
});

// Trace schema (aggregated view of spans)
export const TraceSchema = z.object({
  traceId: z.string(),
  rootSpan: SpanSchema.optional(),
  serviceName: z.string(),
  operationName: z.string(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime().nullable(),
  durationMs: z.number().nullable(),
  spanCount: z.number(),
  errorCount: z.number(),
  status: TraceStatusSchema,
});

export const TraceQuerySchema = z.object({
  serviceName: z.string().optional(),
  operationName: z.string().optional(),
  status: TraceStatusSchema.optional(),
  minDuration: z.coerce.number().optional(),
  maxDuration: z.coerce.number().optional(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export type LogLevel = z.infer<typeof LogLevelSchema>;
export type EnvironmentInfo = z.infer<typeof EnvironmentInfoSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type LogQuery = z.infer<typeof LogQuerySchema>;
export type ErrorGroupStatus = z.infer<typeof ErrorGroupStatusSchema>;
export type ErrorGroup = z.infer<typeof ErrorGroupSchema>;
export type ErrorGroupQuery = z.infer<typeof ErrorGroupQuerySchema>;
export type TraceStatus = z.infer<typeof TraceStatusSchema>;
export type Span = z.infer<typeof SpanSchema>;
export type Trace = z.infer<typeof TraceSchema>;
export type TraceQuery = z.infer<typeof TraceQuerySchema>;
