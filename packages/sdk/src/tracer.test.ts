import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Tracer, createTracer } from './tracer';
import { capturedRequests, resetCapturedRequests } from './mocks/handlers';

describe('Tracer', () => {
  beforeEach(() => {
    resetCapturedRequests();
  });

  describe('createTracer', () => {
    it('should create a tracer instance', () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      expect(tracer).toBeInstanceOf(Tracer);
    });

    it('should generate a session ID if not provided', () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      expect(tracer.getSessionId()).toBeDefined();
      expect(typeof tracer.getSessionId()).toBe('string');
    });

    it('should use provided session ID', () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        sessionId: 'custom-session-123',
      });

      expect(tracer.getSessionId()).toBe('custom-session-123');
    });
  });

  describe('startTrace/endTrace', () => {
    let tracer: Tracer;

    beforeEach(() => {
      tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });
    });

    it('should start a trace and send it to the server', async () => {
      const traceId = tracer.startTrace('Test Trace');

      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(1);
      });

      const request = capturedRequests.traces[0];
      expect(request.method).toBe('POST');
      expect(request.body.name).toBe('Test Trace');
      expect(request.body.appName).toBe('test-app');
      expect(request.body.status).toBe('running');
    });

    it('should set current trace ID after starting', () => {
      const traceId = tracer.startTrace('Test Trace');
      expect(tracer.getCurrentTraceId()).toBe(traceId);
    });

    it('should end a trace and update status', async () => {
      const traceId = tracer.startTrace('Test Trace');

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(1);
      });

      tracer.endTrace(traceId, 'completed');

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(2);
      });

      const updateRequest = capturedRequests.traces[1];
      expect(updateRequest.method).toBe('PATCH');
      expect(updateRequest.body.status).toBe('completed');
      expect(updateRequest.body.endTime).toBeDefined();
      expect(updateRequest.body.durationMs).toBeDefined();
    });

    it('should clear current trace ID after ending', async () => {
      const traceId = tracer.startTrace('Test Trace');
      expect(tracer.getCurrentTraceId()).toBe(traceId);

      tracer.endTrace(traceId);
      expect(tracer.getCurrentTraceId()).toBeNull();
    });

    it('should include metadata in trace', async () => {
      tracer.startTrace('Test Trace', { userId: 123, action: 'test' });

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(1);
      });

      const metadata = capturedRequests.traces[0].body.metadata as Record<string, unknown>;
      expect(metadata.userId).toBe(123);
      expect(metadata.action).toBe('test');
    });
  });

  describe('startSpan/endSpan', () => {
    let tracer: Tracer;

    beforeEach(() => {
      tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });
    });

    it('should throw error if no active trace', () => {
      expect(() => tracer.startSpan('Test Span')).toThrow('No active trace');
    });

    it('should create a span within a trace', async () => {
      const traceId = tracer.startTrace('Test Trace');
      const spanId = tracer.startSpan('Test Span');

      expect(spanId).toBeDefined();
      expect(typeof spanId).toBe('string');

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(1);
      });

      const request = capturedRequests.spans[0];
      expect(request.method).toBe('POST');
      expect(request.body.name).toBe('Test Span');
      expect(request.body.traceId).toBe(traceId);
      expect(request.body.status).toBe('running');
    });

    it('should set current span ID after starting', () => {
      tracer.startTrace('Test Trace');
      const spanId = tracer.startSpan('Test Span');
      expect(tracer.getCurrentSpanId()).toBe(spanId);
    });

    it('should end a span and update status', async () => {
      tracer.startTrace('Test Trace');
      const spanId = tracer.startSpan('Test Span');

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(1);
      });

      tracer.endSpan(spanId, 'completed');

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(2);
      });

      const updateRequest = capturedRequests.spans[1];
      expect(updateRequest.method).toBe('PATCH');
      expect(updateRequest.body.status).toBe('completed');
      expect(updateRequest.body.endTime).toBeDefined();
      expect(updateRequest.body.durationMs).toBeDefined();
    });

    it('should support operation type', async () => {
      tracer.startTrace('Test Trace');
      tracer.startSpan('DB Query', { operationType: 'database' });

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(1);
      });

      expect(capturedRequests.spans[0].body.operationType).toBe('database');
    });

    it('should support nested spans with parent relationship', async () => {
      tracer.startTrace('Test Trace');
      const parentSpanId = tracer.startSpan('Parent Span');
      const childSpanId = tracer.startSpan('Child Span');

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(2);
      });

      const childRequest = capturedRequests.spans[1];
      expect(childRequest.body.parentSpanId).toBe(parentSpanId);

      tracer.endSpan(childSpanId);
      tracer.endSpan(parentSpanId);
    });
  });

  describe('withTrace', () => {
    let tracer: Tracer;

    beforeEach(() => {
      tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });
    });

    it('should wrap a function with trace', async () => {
      const result = await tracer.withTrace('Test Operation', async () => {
        return 'success';
      });

      expect(result).toBe('success');

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(2); // POST + PATCH
      });

      expect(capturedRequests.traces[0].method).toBe('POST');
      expect(capturedRequests.traces[1].method).toBe('PATCH');
      expect(capturedRequests.traces[1].body.status).toBe('completed');
    });

    it('should mark trace as error on exception', async () => {
      await expect(
        tracer.withTrace('Failing Operation', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(2);
      });

      expect(capturedRequests.traces[1].body.status).toBe('error');
    });

    it('should pass metadata to trace', async () => {
      await tracer.withTrace(
        'Test Operation',
        async () => 'success',
        { requestId: 'abc123' }
      );

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(2);
      });

      const metadata = capturedRequests.traces[0].body.metadata as Record<string, unknown>;
      expect(metadata.requestId).toBe('abc123');
    });
  });

  describe('withSpan', () => {
    let tracer: Tracer;

    beforeEach(() => {
      tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });
    });

    it('should wrap a function with span', async () => {
      tracer.startTrace('Test Trace');

      const result = await tracer.withSpan('DB Query', async () => {
        return { data: 'test' };
      });

      expect(result).toEqual({ data: 'test' });

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(2); // POST + PATCH
      });

      expect(capturedRequests.spans[0].method).toBe('POST');
      expect(capturedRequests.spans[1].method).toBe('PATCH');
      expect(capturedRequests.spans[1].body.status).toBe('completed');
    });

    it('should mark span as error on exception', async () => {
      tracer.startTrace('Test Trace');

      await expect(
        tracer.withSpan('Failing Query', async () => {
          throw new Error('Query failed');
        })
      ).rejects.toThrow('Query failed');

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(2);
      });

      expect(capturedRequests.spans[1].body.status).toBe('error');
      const metadata = capturedRequests.spans[1].body.metadata as Record<string, unknown>;
      expect(metadata.error).toBe('Query failed');
    });

    it('should support operation type option', async () => {
      tracer.startTrace('Test Trace');

      await tracer.withSpan(
        'HTTP Request',
        async () => 'response',
        { operationType: 'http' }
      );

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(2);
      });

      expect(capturedRequests.spans[0].body.operationType).toBe('http');
    });
  });

  describe('debug mode', () => {
    it('should log to console when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        debug: true,
      });

      tracer.startTrace('Debug Test');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[TRACE:START] Debug Test'));
      consoleSpy.mockRestore();
    });

    it('should not log to console when debug is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        debug: false,
      });

      tracer.startTrace('No Debug Test');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('session management', () => {
    it('should allow setting new session ID', () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        sessionId: 'initial-session',
      });

      expect(tracer.getSessionId()).toBe('initial-session');

      tracer.setSessionId('new-session');
      expect(tracer.getSessionId()).toBe('new-session');
    });

    it('should use new session ID in subsequent traces', async () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        sessionId: 'session-1',
      });

      tracer.startTrace('First Trace');
      await vi.waitFor(() => expect(capturedRequests.traces.length).toBe(1));
      expect(capturedRequests.traces[0].body.sessionId).toBe('session-1');

      tracer.setSessionId('session-2');
      tracer.startTrace('Second Trace');
      await vi.waitFor(() => expect(capturedRequests.traces.length).toBe(2));
      expect(capturedRequests.traces[1].body.sessionId).toBe('session-2');
    });
  });

  describe('error propagation', () => {
    it('should mark trace as error when span has error', async () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      const traceId = tracer.startTrace('Test Trace');
      const spanId = tracer.startSpan('Failing Span');

      await vi.waitFor(() => {
        expect(capturedRequests.spans.length).toBe(1);
      });

      tracer.endSpan(spanId, 'error');
      tracer.endTrace(traceId);

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(2);
      });

      // The trace should be marked as error because a span failed
      expect(capturedRequests.traces[1].body.status).toBe('error');
    });
  });

  describe('log within trace', () => {
    it('should include trace and span context in logs', async () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      const traceId = tracer.startTrace('Test Trace');
      const spanId = tracer.startSpan('Test Span');

      tracer.log('info', 'Test log message');

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      const logEntry = capturedRequests.ingest[0].body;
      expect(logEntry.traceId).toBe(traceId);
      expect(logEntry.spanId).toBe(spanId);
      expect(logEntry.message).toBe('Test log message');
    });
  });

  describe('enabled flag', () => {
    it('should not make HTTP calls when created with enabled: false', async () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        enabled: false,
      });

      const traceId = tracer.startTrace('Test Trace');
      tracer.startSpan('Test Span');
      tracer.log('info', 'Test message');
      tracer.endTrace(traceId);

      // Wait a bit to ensure no requests are made
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(capturedRequests.traces.length).toBe(0);
      expect(capturedRequests.spans.length).toBe(0);
      expect(capturedRequests.ingest.length).toBe(0);
    });

    it('should not make HTTP calls after disable() is called', async () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        enabled: true,
      });

      // First trace should work
      const traceId1 = tracer.startTrace('First Trace');

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(1);
      });

      tracer.endTrace(traceId1);

      await vi.waitFor(() => {
        expect(capturedRequests.traces.length).toBe(2);
      });

      // Now disable
      tracer.disable();

      // These should not be sent
      const traceId2 = tracer.startTrace('Second Trace');
      tracer.startSpan('Test Span');
      tracer.log('info', 'Test message');
      tracer.endTrace(traceId2);

      // Wait a bit to ensure no new requests are made
      await new Promise(resolve => setTimeout(resolve, 100));

      // Still only the first trace's requests
      expect(capturedRequests.traces.length).toBe(2);
      expect(capturedRequests.spans.length).toBe(0);
      expect(capturedRequests.ingest.length).toBe(0);
    });

    it('should report correct enabled state', () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        enabled: false,
      });

      expect(tracer.isEnabled()).toBe(false);
      expect(tracer.isTracingEnabled()).toBe(false);

      tracer.enable();
      expect(tracer.isEnabled()).toBe(true);
      expect(tracer.isTracingEnabled()).toBe(true);

      tracer.disable();
      expect(tracer.isEnabled()).toBe(false);
      expect(tracer.isTracingEnabled()).toBe(false);
    });

    it('should still return trace/span IDs when disabled', () => {
      const tracer = createTracer({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        enabled: false,
      });

      const traceId = tracer.startTrace('Test Trace');
      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');
      expect(tracer.getCurrentTraceId()).toBe(traceId);

      const spanId = tracer.startSpan('Test Span');
      expect(spanId).toBeDefined();
      expect(typeof spanId).toBe('string');
      expect(tracer.getCurrentSpanId()).toBe(spanId);
    });
  });
});
