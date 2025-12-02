import type { TracerConfig, Trace, Span, TraceStatus, LogLevel, EnvironmentInfo } from './types';
import { detectEnvironment } from './environment';
import { generateId, getTimestamp } from './utils';

interface ActiveSpan {
  span: Span;
  startTimestamp: number;
}

interface ActiveTrace {
  trace: Trace;
  startTimestamp: number;
  spans: Map<string, ActiveSpan>;
}

/**
 * Tracer class for distributed tracing support
 */
export class Tracer {
  private config: Required<Omit<TracerConfig, 'onError' | 'metadata'>> & Pick<TracerConfig, 'onError' | 'metadata'>;
  private environment: EnvironmentInfo;
  private sessionId: string;
  private activeTraces: Map<string, ActiveTrace> = new Map();
  private currentTraceId: string | null = null;
  private currentSpanId: string | null = null;

  constructor(config: TracerConfig) {
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
      spanTimeout: config.spanTimeout ?? 300000, // 5 minutes default
    };

    this.sessionId = this.config.sessionId;
    this.environment = detectEnvironment();
  }

  /**
   * Start a new trace
   */
  startTrace(name: string, metadata?: Record<string, unknown>): string {
    const traceId = generateId();
    const startTime = getTimestamp();
    const startTimestamp = Date.now();

    const trace: Trace = {
      id: traceId,
      name,
      appName: this.config.appName,
      sessionId: this.sessionId,
      startTime,
      endTime: null,
      durationMs: null,
      status: 'running',
      metadata: {
        ...this.config.metadata,
        ...metadata,
      },
    };

    this.activeTraces.set(traceId, {
      trace,
      startTimestamp,
      spans: new Map(),
    });

    this.currentTraceId = traceId;

    // Send trace creation to server
    this.sendTrace(trace);

    if (this.config.debug) {
      console.log(`[TRACE:START] ${name} (${traceId})`);
    }

    return traceId;
  }

  /**
   * End a trace
   */
  endTrace(traceId: string, status: TraceStatus = 'completed'): void {
    const activeTrace = this.activeTraces.get(traceId);
    if (!activeTrace) {
      if (this.config.debug) {
        console.warn(`[TRACE:END] Trace ${traceId} not found`);
      }
      return;
    }

    const endTime = getTimestamp();
    const durationMs = Date.now() - activeTrace.startTimestamp;

    // End all active spans in this trace
    for (const [spanId] of activeTrace.spans) {
      this.endSpan(spanId, activeTrace.trace.status === 'error' ? 'error' : 'completed');
    }

    // Determine final status
    const hasErrors = activeTrace.trace.status === 'error';
    const finalStatus = hasErrors ? 'error' : status;

    // Update trace
    const updatedTrace: Partial<Trace> = {
      endTime,
      durationMs,
      status: finalStatus,
    };

    // Send trace update to server
    this.updateTraceOnServer(traceId, updatedTrace);

    if (this.config.debug) {
      console.log(`[TRACE:END] ${activeTrace.trace.name} (${traceId}) - ${durationMs}ms - ${finalStatus}`);
    }

    this.activeTraces.delete(traceId);

    if (this.currentTraceId === traceId) {
      this.currentTraceId = null;
      this.currentSpanId = null;
    }
  }

  /**
   * Start a new span within a trace
   */
  startSpan(name: string, options?: {
    traceId?: string;
    parentSpanId?: string;
    operationType?: string;
    metadata?: Record<string, unknown>;
  }): string {
    const traceId = options?.traceId || this.currentTraceId;
    if (!traceId) {
      throw new Error('No active trace. Call startTrace() first or provide a traceId.');
    }

    const activeTrace = this.activeTraces.get(traceId);
    if (!activeTrace) {
      throw new Error(`Trace ${traceId} not found or already ended.`);
    }

    const spanId = generateId();
    const startTime = getTimestamp();
    const startTimestamp = Date.now();
    const parentSpanId = options?.parentSpanId || this.currentSpanId || null;

    const span: Span = {
      id: spanId,
      traceId,
      parentSpanId,
      name,
      operationType: options?.operationType || null,
      startTime,
      endTime: null,
      durationMs: null,
      status: 'running',
      metadata: options?.metadata,
    };

    activeTrace.spans.set(spanId, {
      span,
      startTimestamp,
    });

    this.currentSpanId = spanId;

    // Send span creation to server
    this.sendSpan(span);

    if (this.config.debug) {
      console.log(`[SPAN:START] ${name} (${spanId}) in trace ${traceId}`);
    }

    return spanId;
  }

  /**
   * End a span
   */
  endSpan(spanId: string, status: TraceStatus = 'completed', metadata?: Record<string, unknown>): void {
    // Find the span in any active trace
    let activeTrace: ActiveTrace | undefined;
    let activeSpan: ActiveSpan | undefined;

    for (const [, trace] of this.activeTraces) {
      const span = trace.spans.get(spanId);
      if (span) {
        activeTrace = trace;
        activeSpan = span;
        break;
      }
    }

    if (!activeSpan || !activeTrace) {
      if (this.config.debug) {
        console.warn(`[SPAN:END] Span ${spanId} not found`);
      }
      return;
    }

    const endTime = getTimestamp();
    const durationMs = Date.now() - activeSpan.startTimestamp;

    // Update span
    const updatedSpan: Partial<Span> = {
      endTime,
      durationMs,
      status,
      metadata: metadata ? { ...activeSpan.span.metadata, ...metadata } : activeSpan.span.metadata,
    };

    // Send span update to server
    this.updateSpanOnServer(spanId, updatedSpan);

    if (this.config.debug) {
      console.log(`[SPAN:END] ${activeSpan.span.name} (${spanId}) - ${durationMs}ms - ${status}`);
    }

    activeTrace.spans.delete(spanId);

    // If span had an error, mark the trace as having an error
    if (status === 'error') {
      activeTrace.trace.status = 'error';
    }

    // Update current span to parent
    if (this.currentSpanId === spanId) {
      this.currentSpanId = activeSpan.span.parentSpanId;
    }
  }

  /**
   * Execute a function within a span
   */
  async withSpan<T>(
    name: string,
    fn: () => T | Promise<T>,
    options?: {
      operationType?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<T> {
    const spanId = this.startSpan(name, options);
    try {
      const result = await fn();
      this.endSpan(spanId, 'completed');
      return result;
    } catch (error) {
      this.endSpan(spanId, 'error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute a function within a trace
   */
  async withTrace<T>(
    name: string,
    fn: () => T | Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const traceId = this.startTrace(name, metadata);
    try {
      const result = await fn();
      this.endTrace(traceId, 'completed');
      return result;
    } catch (error) {
      this.endTrace(traceId, 'error');
      throw error;
    }
  }

  /**
   * Log a message within the current trace/span context
   */
  log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const entry = {
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
      traceId: this.currentTraceId || undefined,
      spanId: this.currentSpanId || undefined,
    };

    // Send to ingest endpoint
    const ingestEndpoint = this.config.endpoint.replace('/traces', '/ingest');
    fetch(ingestEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch((error) => {
      if (this.config.onError) {
        this.config.onError(error);
      }
    });

    if (this.config.debug) {
      console.log(`[${level.toUpperCase()}]`, message, metadata);
    }
  }

  /**
   * Get current trace ID
   */
  getCurrentTraceId(): string | null {
    return this.currentTraceId;
  }

  /**
   * Get current span ID
   */
  getCurrentSpanId(): string | null {
    return this.currentSpanId;
  }

  /**
   * Get the session ID
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

  private sendTrace(trace: Trace): void {
    const tracesEndpoint = this.config.endpoint.replace('/ingest', '/traces');
    fetch(tracesEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trace),
    }).catch((error) => {
      if (this.config.onError) {
        this.config.onError(error);
      }
    });
  }

  private updateTraceOnServer(traceId: string, updates: Partial<Trace>): void {
    const tracesEndpoint = this.config.endpoint.replace('/ingest', `/traces/${traceId}`);
    fetch(tracesEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch((error) => {
      if (this.config.onError) {
        this.config.onError(error);
      }
    });
  }

  private sendSpan(span: Span): void {
    const spansEndpoint = this.config.endpoint.replace('/ingest', '/spans');
    fetch(spansEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(span),
    }).catch((error) => {
      if (this.config.onError) {
        this.config.onError(error);
      }
    });
  }

  private updateSpanOnServer(spanId: string, updates: Partial<Span>): void {
    const spansEndpoint = this.config.endpoint.replace('/ingest', `/spans/${spanId}`);
    fetch(spansEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch((error) => {
      if (this.config.onError) {
        this.config.onError(error);
      }
    });
  }
}

/**
 * Create a new tracer instance
 */
export function createTracer(config: TracerConfig): Tracer {
  return new Tracer(config);
}
