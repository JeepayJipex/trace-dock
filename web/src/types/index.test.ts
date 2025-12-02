import { describe, it, expect } from 'vitest';
import type { 
  LogEntry, 
  LogLevel, 
  ErrorGroup, 
  ErrorGroupStatus,
  Trace,
  TraceStatus,
  Span,
} from './index';

describe('Types', () => {
  describe('LogEntry', () => {
    it('should have required fields', () => {
      const log: LogEntry = {
        id: 'test-123',
        timestamp: '2024-01-01T00:00:00Z',
        level: 'info',
        message: 'Test message',
        appName: 'test-app',
        sessionId: 'session-1',
        environment: { type: 'node' },
      };

      expect(log.id).toBe('test-123');
      expect(log.level).toBe('info');
      expect(log.message).toBe('Test message');
    });

    it('should allow optional fields', () => {
      const log: LogEntry = {
        id: 'test-123',
        timestamp: '2024-01-01T00:00:00Z',
        level: 'error',
        message: 'Error message',
        appName: 'test-app',
        sessionId: 'session-1',
        environment: { type: 'node' },
        metadata: { userId: 123 },
        stackTrace: 'Error: test\n  at line 1',
        context: { requestId: 'req-1' },
        errorGroupId: 'group-1',
      };

      expect(log.metadata?.userId).toBe(123);
      expect(log.stackTrace).toContain('Error');
      expect(log.errorGroupId).toBe('group-1');
    });
  });

  describe('LogLevel', () => {
    it('should only allow valid log levels', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      
      expect(levels).toContain('debug');
      expect(levels).toContain('info');
      expect(levels).toContain('warn');
      expect(levels).toContain('error');
      expect(levels).toHaveLength(4);
    });
  });

  describe('ErrorGroup', () => {
    it('should have required fields', () => {
      const group: ErrorGroup = {
        id: 'group-1',
        fingerprint: 'fp-123',
        message: 'Connection error',
        appName: 'test-app',
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-02T00:00:00Z',
        occurrenceCount: 10,
        status: 'unreviewed',
      };

      expect(group.id).toBe('group-1');
      expect(group.occurrenceCount).toBe(10);
      expect(group.status).toBe('unreviewed');
    });

    it('should support all status values', () => {
      const statuses: ErrorGroupStatus[] = ['unreviewed', 'reviewed', 'ignored', 'resolved'];
      
      expect(statuses).toContain('unreviewed');
      expect(statuses).toContain('reviewed');
      expect(statuses).toContain('ignored');
      expect(statuses).toContain('resolved');
    });
  });

  describe('Trace', () => {
    it('should have required fields', () => {
      const trace: Trace = {
        id: 'trace-1',
        name: 'HTTP Request',
        appName: 'test-app',
        sessionId: 'session-1',
        startTime: '2024-01-01T00:00:00Z',
        endTime: null,
        durationMs: null,
        status: 'running',
        spanCount: 0,
        errorCount: 0,
      };

      expect(trace.id).toBe('trace-1');
      expect(trace.status).toBe('running');
      expect(trace.spanCount).toBe(0);
    });

    it('should support completed trace', () => {
      const trace: Trace = {
        id: 'trace-1',
        name: 'HTTP Request',
        appName: 'test-app',
        sessionId: 'session-1',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
        durationMs: 1000,
        status: 'completed',
        spanCount: 5,
        errorCount: 0,
        metadata: { path: '/api/users' },
      };

      expect(trace.endTime).toBeDefined();
      expect(trace.durationMs).toBe(1000);
      expect(trace.status).toBe('completed');
      expect(trace.metadata?.path).toBe('/api/users');
    });

    it('should support all status values', () => {
      const statuses: TraceStatus[] = ['running', 'completed', 'error'];
      
      expect(statuses).toContain('running');
      expect(statuses).toContain('completed');
      expect(statuses).toContain('error');
    });
  });

  describe('Span', () => {
    it('should have required fields', () => {
      const span: Span = {
        id: 'span-1',
        traceId: 'trace-1',
        parentSpanId: null,
        name: 'Database Query',
        operationType: 'database',
        startTime: '2024-01-01T00:00:00Z',
        endTime: null,
        durationMs: null,
        status: 'running',
      };

      expect(span.id).toBe('span-1');
      expect(span.traceId).toBe('trace-1');
      expect(span.parentSpanId).toBeNull();
    });

    it('should support parent span', () => {
      const span: Span = {
        id: 'span-2',
        traceId: 'trace-1',
        parentSpanId: 'span-1',
        name: 'Cache Lookup',
        operationType: 'cache',
        startTime: '2024-01-01T00:00:00.100Z',
        endTime: '2024-01-01T00:00:00.150Z',
        durationMs: 50,
        status: 'completed',
        metadata: { cacheHit: true },
      };

      expect(span.parentSpanId).toBe('span-1');
      expect(span.durationMs).toBe(50);
      expect(span.metadata?.cacheHit).toBe(true);
    });
  });
});
