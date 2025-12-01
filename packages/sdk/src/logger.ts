import type { LoggerConfig, LogEntry, LogLevel, EnvironmentInfo } from './types';
import { HttpTransport, WebSocketTransport } from './transport';
import { detectEnvironment } from './environment';
import { generateId, getTimestamp, createStackTrace, parseStackTrace } from './utils';

/**
 * Main Logger class
 */
export class Logger {
  private config: Required<Omit<LoggerConfig, 'onError' | 'metadata'>> & Pick<LoggerConfig, 'onError' | 'metadata'>;
  private httpTransport: HttpTransport;
  private wsTransport: WebSocketTransport | null = null;
  private environment: EnvironmentInfo;
  private sessionId: string;

  constructor(config: LoggerConfig) {
    this.config = {
      endpoint: config.endpoint,
      appName: config.appName,
      sessionId: config.sessionId || generateId(),
      enableWebSocket: config.enableWebSocket ?? false,
      wsEndpoint: config.wsEndpoint || config.endpoint.replace(/^http/, 'ws').replace('/ingest', '/live'),
      batchSize: config.batchSize ?? 10,
      flushInterval: config.flushInterval ?? 5000,
      maxRetries: config.maxRetries ?? 3,
      debug: config.debug ?? false,
      onError: config.onError,
      metadata: config.metadata,
    };

    this.sessionId = this.config.sessionId;
    this.environment = detectEnvironment();

    this.httpTransport = new HttpTransport({
      endpoint: this.config.endpoint,
      maxRetries: this.config.maxRetries,
      onError: this.config.onError,
    });

    if (this.config.enableWebSocket) {
      this.wsTransport = new WebSocketTransport(
        this.config.wsEndpoint,
        this.config.onError
      );
      this.wsTransport.connect();
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log a warning message (includes stack trace)
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata, createStackTrace());
  }

  /**
   * Log an error message (includes stack trace)
   */
  error(message: string, metadata?: Record<string, unknown>): void {
    const errorObj = metadata?.error;
    const stackTrace = parseStackTrace(errorObj) || createStackTrace();
    this.log('error', message, metadata, stackTrace);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger({
      ...this.config,
      metadata: {
        ...this.config.metadata,
        ...context,
      },
    });
    return childLogger;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Set a new session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Disconnect WebSocket transport
   */
  disconnect(): void {
    this.wsTransport?.disconnect();
  }

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    stackTrace?: string
  ): void {
    const entry: LogEntry = {
      id: generateId(),
      timestamp: getTimestamp(),
      level,
      message,
      appName: this.config.appName,
      sessionId: this.sessionId,
      environment: this.environment,
      metadata: {
        ...this.config.metadata,
        ...metadata,
      },
      stackTrace,
    };

    if (this.config.debug) {
      console.log(`[${level.toUpperCase()}]`, message, metadata);
    }

    // Send via HTTP
    this.httpTransport.send(entry);

    // Also send via WebSocket if enabled
    if (this.wsTransport) {
      this.wsTransport.send(entry);
    }
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}
