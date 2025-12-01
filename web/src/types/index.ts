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
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
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
