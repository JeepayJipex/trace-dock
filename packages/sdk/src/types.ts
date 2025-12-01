export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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

export interface EnvironmentInfo {
  type: 'browser' | 'node' | 'tauri' | 'unknown';
  userAgent?: string;
  url?: string;
  nodeVersion?: string;
  platform?: string;
  arch?: string;
  tauriVersion?: string;
}

export interface LoggerConfig {
  endpoint: string;
  appName: string;
  sessionId?: string;
  enableWebSocket?: boolean;
  wsEndpoint?: string;
  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  debug?: boolean;
  onError?: (error: Error) => void;
  metadata?: Record<string, unknown>;
}

export interface TransportOptions {
  endpoint: string;
  maxRetries: number;
  onError?: (error: Error) => void;
}
