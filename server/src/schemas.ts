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
  timestamp: z.string().datetime(),
  level: LogLevelSchema,
  message: z.string(),
  appName: z.string(),
  sessionId: z.string(),
  environment: EnvironmentInfoSchema,
  metadata: z.record(z.unknown()).optional(),
  stackTrace: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  errorGroupId: z.string().optional(),
});

export const LogQuerySchema = z.object({
  level: LogLevelSchema.optional(),
  appName: z.string().optional(),
  sessionId: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
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
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
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

export type LogLevel = z.infer<typeof LogLevelSchema>;
export type EnvironmentInfo = z.infer<typeof EnvironmentInfoSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type LogQuery = z.infer<typeof LogQuerySchema>;
export type ErrorGroupStatus = z.infer<typeof ErrorGroupStatusSchema>;
export type ErrorGroup = z.infer<typeof ErrorGroupSchema>;
export type ErrorGroupQuery = z.infer<typeof ErrorGroupQuerySchema>;
