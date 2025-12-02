import { describe, it, expect } from 'vitest';
import {
  LogEntrySchema,
  LogQuerySchema,
  ErrorGroupQuerySchema,
  UpdateErrorGroupStatusSchema,
  LogLevelSchema,
  EnvironmentInfoSchema,
  ErrorGroupStatusSchema,
} from './schemas';

describe('Schemas', () => {
  describe('LogLevelSchema', () => {
    it('should accept valid log levels', () => {
      expect(LogLevelSchema.safeParse('debug').success).toBe(true);
      expect(LogLevelSchema.safeParse('info').success).toBe(true);
      expect(LogLevelSchema.safeParse('warn').success).toBe(true);
      expect(LogLevelSchema.safeParse('error').success).toBe(true);
    });

    it('should reject invalid log levels', () => {
      expect(LogLevelSchema.safeParse('trace').success).toBe(false);
      expect(LogLevelSchema.safeParse('fatal').success).toBe(false);
      expect(LogLevelSchema.safeParse('').success).toBe(false);
    });
  });

  describe('EnvironmentInfoSchema', () => {
    it('should accept valid browser environment', () => {
      const env = {
        type: 'browser',
        userAgent: 'Mozilla/5.0',
        url: 'https://example.com',
      };
      const result = EnvironmentInfoSchema.safeParse(env);
      expect(result.success).toBe(true);
    });

    it('should accept valid node environment', () => {
      const env = {
        type: 'node',
        nodeVersion: '20.0.0',
        platform: 'linux',
        arch: 'x64',
      };
      const result = EnvironmentInfoSchema.safeParse(env);
      expect(result.success).toBe(true);
    });

    it('should accept minimal environment', () => {
      const env = { type: 'unknown' };
      const result = EnvironmentInfoSchema.safeParse(env);
      expect(result.success).toBe(true);
    });

    it('should reject invalid environment type', () => {
      const env = { type: 'invalid' };
      const result = EnvironmentInfoSchema.safeParse(env);
      expect(result.success).toBe(false);
    });
  });

  describe('LogEntrySchema', () => {
    const validLogEntry = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'info',
      message: 'Test message',
      appName: 'test-app',
      sessionId: 'session-123',
      environment: { type: 'node' },
    };

    it('should accept valid log entry', () => {
      const result = LogEntrySchema.safeParse(validLogEntry);
      expect(result.success).toBe(true);
    });

    it('should accept log entry with all optional fields', () => {
      const entry = {
        ...validLogEntry,
        metadata: { userId: 123, action: 'test' },
        stackTrace: 'Error at line 1',
        context: { requestId: 'req-123' },
        traceId: 'trace-123',
        spanId: 'span-123',
        parentSpanId: 'parent-123',
      };
      const result = LogEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    });

    it('should reject entry without required id', () => {
      const { id, ...entryWithoutId } = validLogEntry;
      const result = LogEntrySchema.safeParse(entryWithoutId);
      expect(result.success).toBe(false);
    });

    it('should reject entry with invalid UUID', () => {
      const entry = { ...validLogEntry, id: 'not-a-uuid' };
      const result = LogEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it('should reject entry with invalid timestamp', () => {
      const entry = { ...validLogEntry, timestamp: 'not-a-date' };
      const result = LogEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it('should reject entry with invalid level', () => {
      const entry = { ...validLogEntry, level: 'invalid' };
      const result = LogEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it('should reject entry without message', () => {
      const { message, ...entryWithoutMessage } = validLogEntry;
      const result = LogEntrySchema.safeParse(entryWithoutMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('LogQuerySchema', () => {
    it('should accept empty query (uses defaults)', () => {
      const result = LogQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(50);
      expect(result.data?.offset).toBe(0);
    });

    it('should accept query with all filters', () => {
      const query = {
        level: 'error',
        appName: 'my-app',
        sessionId: 'session-1',
        search: 'database',
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-31T23:59:59.000Z',
        limit: 100,
        offset: 50,
      };
      const result = LogQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data?.level).toBe('error');
      expect(result.data?.limit).toBe(100);
    });

    it('should coerce string numbers to numbers', () => {
      const query = { limit: '25', offset: '10' };
      const result = LogQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(25);
      expect(result.data?.offset).toBe(10);
    });

    it('should reject limit over 1000', () => {
      const query = { limit: 2000 };
      const result = LogQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const query = { offset: -1 };
      const result = LogQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });

  describe('ErrorGroupStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(ErrorGroupStatusSchema.safeParse('unreviewed').success).toBe(true);
      expect(ErrorGroupStatusSchema.safeParse('reviewed').success).toBe(true);
      expect(ErrorGroupStatusSchema.safeParse('ignored').success).toBe(true);
      expect(ErrorGroupStatusSchema.safeParse('resolved').success).toBe(true);
    });

    it('should reject invalid status', () => {
      expect(ErrorGroupStatusSchema.safeParse('pending').success).toBe(false);
      expect(ErrorGroupStatusSchema.safeParse('').success).toBe(false);
    });
  });

  describe('ErrorGroupQuerySchema', () => {
    it('should accept empty query (uses defaults)', () => {
      const result = ErrorGroupQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.sortBy).toBe('last_seen');
      expect(result.data?.sortOrder).toBe('desc');
      expect(result.data?.limit).toBe(20);
    });

    it('should accept query with filters', () => {
      const query = {
        appName: 'my-app',
        status: 'unreviewed',
        search: 'connection',
        sortBy: 'occurrence_count',
        sortOrder: 'desc',
        limit: 50,
        offset: 0,
      };
      const result = ErrorGroupQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should reject invalid sortBy', () => {
      const query = { sortBy: 'invalid_column' };
      const result = ErrorGroupQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateErrorGroupStatusSchema', () => {
    it('should accept valid status update', () => {
      const result = UpdateErrorGroupStatusSchema.safeParse({ status: 'resolved' });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('resolved');
    });

    it('should reject update without status', () => {
      const result = UpdateErrorGroupStatusSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = UpdateErrorGroupStatusSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });
  });
});
