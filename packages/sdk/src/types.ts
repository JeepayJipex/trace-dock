export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type TraceStatus = 'running' | 'completed' | 'error';

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  function?: string;
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
  sourceLocation?: SourceLocation;
  context?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
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

export interface Trace {
  id: string;
  name: string;
  appName: string;
  sessionId: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: TraceStatus;
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
   * Enable or disable all SDK functionality globally.
   * When false, no logs will be sent. Default: true
   */
  enabled?: boolean;
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

export interface TracerConfig extends LoggerConfig {
  /**
   * Enable or disable tracing (traces and spans).
   * When false, no traces/spans will be sent but logs still work.
   * Default: true (follows global `enabled` if not specified)
   */
  enableTracing?: boolean;
  /**
   * Auto-end spans that haven't been ended after this duration (ms)
   */
  spanTimeout?: number;
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
  /**
   * Whether the transport is enabled. When false, no HTTP calls will be made.
   */
  enabled?: boolean;
}
