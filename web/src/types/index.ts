export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface EnvironmentInfo {
  type: 'browser' | 'node' | 'tauri' | 'unknown';
  userAgent?: string;
  url?: string;
  nodeVersion?: string;
  platform?: string;
  arch?: string;
  tauriVersion?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  appName: string;
  sessionId: string;
  environment: EnvironmentInfo;
  metadata?: Record<string, unknown>;
  stackTrace?: string;
  context?: Record<string, unknown>;
  errorGroupId?: string;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface LogsWithIgnoredResponse extends LogsResponse {
  ignoredCount: number;
}

export interface LogFilters {
  level?: LogLevel;
  appName?: string;
  sessionId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface StatsResponse {
  total: number;
  byLevel: Record<string, number>;
  byApp: Record<string, number>;
}

// ==================== Error Groups ====================

export type ErrorGroupStatus = 'unreviewed' | 'reviewed' | 'ignored' | 'resolved';

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

export interface ErrorGroupsResponse {
  errorGroups: ErrorGroup[];
  total: number;
  limit: number;
  offset: number;
}

export interface ErrorGroupFilters {
  appName?: string;
  status?: ErrorGroupStatus;
  search?: string;
  sortBy?: 'last_seen' | 'first_seen' | 'occurrence_count';
  sortOrder?: 'asc' | 'desc';
}

export interface ErrorGroupStats {
  totalGroups: number;
  totalOccurrences: number;
  byStatus: Record<ErrorGroupStatus, number>;
  byApp: Record<string, number>;
  recentTrend: { date: string; count: number }[];
}

// ==================== Traces ====================

export type TraceStatus = 'running' | 'completed' | 'error';

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

export interface TracesResponse {
  traces: Trace[];
  total: number;
  limit: number;
  offset: number;
}

export interface TraceWithDetails {
  trace: Trace;
  spans: Span[];
  logs: LogEntry[];
}

export interface TraceFilters {
  appName?: string;
  sessionId?: string;
  status?: TraceStatus;
  name?: string;
  minDuration?: number;
  maxDuration?: number;
  startDate?: string;
  endDate?: string;
}

export interface TraceStats {
  totalTraces: number;
  avgDurationMs: number;
  byStatus: Record<TraceStatus, number>;
  byApp: Record<string, number>;
  recentTrend: { date: string; count: number; avgDuration: number }[];
}

// ==================== Settings ====================

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
