import type { LogEntry } from '../schemas';

/**
 * Repository types that mirror the database entities
 */

export type ErrorGroupStatus = 'unreviewed' | 'reviewed' | 'ignored' | 'resolved';
export type TraceStatus = 'running' | 'completed' | 'error';

export interface ErrorGroup {
  id: string;
  fingerprint: string;
  message: string;
  appName: string;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  status: ErrorGroupStatus;
  stackTracePreview?: string;
}

export interface Trace {
  id: string;
  name: string;
  appName: string;
  sessionId: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: TraceStatus;
  spanCount: number;
  errorCount: number;
  metadata?: Record<string, unknown>;
}

export interface Span {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  operationType: string | null;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: TraceStatus;
  metadata?: Record<string, unknown>;
}

export interface RetentionSettings {
  logsRetentionDays: number;
  tracesRetentionDays: number;
  spansRetentionDays: number;
  errorGroupsRetentionDays: number;
  cleanupEnabled: boolean;
  cleanupIntervalHours: number;
}

export interface StorageStats {
  totalLogs: number;
  totalTraces: number;
  totalSpans: number;
  totalErrorGroups: number;
  databaseSizeBytes: number;
  oldestLog: string | null;
  oldestTrace: string | null;
}

export interface CleanupResult {
  logsDeleted: number;
  tracesDeleted: number;
  spansDeleted: number;
  errorGroupsDeleted: number;
  durationMs: number;
}

// ============================================
// Query Parameters
// ============================================

export interface LogsQueryParams {
  level?: string;
  appName?: string;
  sessionId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  traceId?: string;
  spanId?: string;
  limit: number;
  offset: number;
}

export interface PaginatedLogs {
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface ErrorGroupsQueryParams {
  appName?: string;
  status?: ErrorGroupStatus;
  search?: string;
  sortBy?: 'last_seen' | 'first_seen' | 'occurrence_count';
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface PaginatedErrorGroups {
  errorGroups: ErrorGroup[];
  total: number;
  limit: number;
  offset: number;
}

export interface TracesQueryParams {
  appName?: string;
  sessionId?: string;
  status?: TraceStatus;
  name?: string;
  minDuration?: number;
  maxDuration?: number;
  startDate?: string;
  endDate?: string;
  limit: number;
  offset: number;
}

export interface PaginatedTraces {
  traces: Trace[];
  total: number;
  limit: number;
  offset: number;
}

export interface ErrorGroupStats {
  totalGroups: number;
  totalOccurrences: number;
  byStatus: Record<ErrorGroupStatus, number>;
  byApp: Record<string, number>;
  recentTrend: { date: string; count: number }[];
}

export interface TraceStats {
  totalTraces: number;
  avgDurationMs: number;
  byStatus: Record<TraceStatus, number>;
  byApp: Record<string, number>;
  recentTrend: { date: string; count: number; avgDuration: number }[];
}

export interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byApp: Record<string, number>;
}

// ============================================
// Repository Interface
// ============================================

/**
 * Main repository interface for all database operations.
 * Implementations should be provided for each database type.
 */
export interface IRepository {
  // ==================== Logs ====================
  insertLog(log: LogEntry): { errorGroupId?: string };
  getLogs(params: LogsQueryParams): PaginatedLogs;
  getLogById(id: string): LogEntry | null;
  getRecentLogs(limit?: number): LogEntry[];
  getStats(): LogStats;
  getAppNames(): string[];
  getSessionIds(appName?: string): string[];
  getMetadataKeys(): string[];
  getSearchSuggestions(prefix: string): { type: string; value: string }[];
  getLogsWithIgnoredInfo(params: LogsQueryParams & { excludeIgnored?: boolean }): PaginatedLogs & { ignoredCount: number };
  getLogsByTraceId(traceId: string, limit?: number): LogEntry[];

  // ==================== Error Groups ====================
  getErrorGroups(params: ErrorGroupsQueryParams): PaginatedErrorGroups;
  getErrorGroupById(id: string): ErrorGroup | null;
  updateErrorGroupStatus(id: string, status: ErrorGroupStatus): boolean;
  getErrorGroupOccurrences(groupId: string, limit?: number, offset?: number): PaginatedLogs;
  getErrorGroupStats(): ErrorGroupStats;
  getIgnoredErrorGroupIds(): string[];

  // ==================== Traces ====================
  getTraces(params: TracesQueryParams): PaginatedTraces;
  getTraceById(id: string): Trace | null;
  createTrace(trace: Omit<Trace, 'spanCount' | 'errorCount'>): Trace;
  updateTrace(id: string, updates: Partial<Pick<Trace, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean;
  getTraceStats(): TraceStats;
  getTraceWithDetails(id: string): { trace: Trace; spans: Span[]; logs: LogEntry[] } | null;

  // ==================== Spans ====================
  getSpansByTraceId(traceId: string): Span[];
  getSpanById(id: string): Span | null;
  createSpan(span: Span): Span;
  updateSpan(id: string, updates: Partial<Pick<Span, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean;

  // ==================== Settings ====================
  getSettings(): RetentionSettings;
  updateSettings(updates: Partial<RetentionSettings>): RetentionSettings;
  getStorageStats(): StorageStats;

  // ==================== Cleanup ====================
  cleanupOldLogs(retentionDays: number): number;
  cleanupOldTraces(retentionDays: number): number;
  cleanupOldSpans(retentionDays: number): number;
  cleanupOldErrorGroups(retentionDays: number): number;
  cleanupOrphanedSpans(): number;
  runCleanup(): CleanupResult;
  purgeAllData(): CleanupResult;

  // ==================== Lifecycle ====================
  close(): void;
}
