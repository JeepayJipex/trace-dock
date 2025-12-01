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
  /**
   * The HTTP endpoint to send log entries to.
   */
  endpoint: string;
  /**
   * The name of the application generating logs.
   */
  appName: string;
  /**
   * A unique identifier for the logging session.
   */
  sessionId?: string;
  /**
   * Enable WebSocket for real-time log streaming.
   */
  enableWebSocket?: boolean;
  /**
   * The WebSocket endpoint for real-time log streaming.
   */
  wsEndpoint?: string;
  /**
   * The number of log entries to batch before sending.
   */
  batchSize?: number;
  /**
   * The interval in milliseconds to flush log entries.
   */
  flushInterval?: number;
  /**
   * The maximum number of retries for failed requests.
   */
  maxRetries?: number;
  /**
   * Enable debug mode to also log to the console.
   */
  debug?: boolean;
  /**
   * Callback for handling errors.
   */
  onError?: (error: Error) => void;
  /**
   * Default metadata to include with all log entries.
   */
  metadata?: Record<string, unknown>;
}

export interface TransportOptions {
  /**
   * The HTTP endpoint to send log entries to.
   */
  endpoint: string;
  /**
   * The maximum number of retries for failed requests.
   */
  maxRetries: number;
  /**
   * Callback for handling errors.
   */
  onError?: (error: Error) => void;
}
