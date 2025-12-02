import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger, createLogger } from './logger';
import { capturedRequests, resetCapturedRequests } from './mocks/handlers';

describe('Logger', () => {
  // Reset captured requests before each test to avoid leakage
  beforeEach(() => {
    resetCapturedRequests();
  });

  describe('createLogger', () => {
    it('should create a logger instance', () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      expect(logger).toBeInstanceOf(Logger);
    });

    it('should generate a session ID if not provided', () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      const sessionId = logger.getSessionId();
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should use provided session ID', () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        sessionId: 'custom-session-123',
      });

      expect(logger.getSessionId()).toBe('custom-session-123');
    });
  });

  describe('logging methods', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });
    });

    it('should send debug log', async () => {
      logger.debug('Debug message', { key: 'value' });

      // Wait for the request to be captured
      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      const request = capturedRequests.ingest[0];
      expect(request.url).toBe('http://localhost:3001/ingest');
      expect(request.body.level).toBe('debug');
      expect(request.body.message).toBe('Debug message');
      expect(request.body.appName).toBe('test-app');
      expect((request.body.metadata as Record<string, unknown>).key).toBe('value');
    });

    it('should send info log', async () => {
      logger.info('Info message');

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      expect(capturedRequests.ingest[0].body.level).toBe('info');
      expect(capturedRequests.ingest[0].body.message).toBe('Info message');
    });

    it('should send warn log with stack trace', async () => {
      logger.warn('Warning message');

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      expect(capturedRequests.ingest[0].body.level).toBe('warn');
      expect(capturedRequests.ingest[0].body.message).toBe('Warning message');
      expect(capturedRequests.ingest[0].body.stackTrace).toBeDefined();
    });

    it('should send error log with stack trace', async () => {
      logger.error('Error message', { error: new Error('Test error') });

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      expect(capturedRequests.ingest[0].body.level).toBe('error');
      expect(capturedRequests.ingest[0].body.message).toBe('Error message');
      expect(capturedRequests.ingest[0].body.stackTrace).toBeDefined();
    });

    it('should include timestamp and id in log entries', async () => {
      logger.info('Test message');

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      const body = capturedRequests.ingest[0].body;
      expect(body.id).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp as string).getTime()).not.toBeNaN();
    });

    it('should send multiple logs sequentially', async () => {
      logger.debug('First');
      logger.info('Second');
      logger.warn('Third');

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(3);
      });

      expect(capturedRequests.ingest[0].body.level).toBe('debug');
      expect(capturedRequests.ingest[1].body.level).toBe('info');
      expect(capturedRequests.ingest[2].body.level).toBe('warn');
    });
  });

  describe('session management', () => {
    it('should allow setting new session ID', () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        sessionId: 'initial-session',
      });

      expect(logger.getSessionId()).toBe('initial-session');
      
      logger.setSessionId('new-session');
      expect(logger.getSessionId()).toBe('new-session');
    });

    it('should use new session ID in subsequent logs', async () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        sessionId: 'session-1',
      });

      logger.info('First log');
      await vi.waitFor(() => expect(capturedRequests.ingest.length).toBe(1));
      expect(capturedRequests.ingest[0].body.sessionId).toBe('session-1');

      logger.setSessionId('session-2');
      logger.info('Second log');
      await vi.waitFor(() => expect(capturedRequests.ingest.length).toBe(2));
      expect(capturedRequests.ingest[1].body.sessionId).toBe('session-2');
    });
  });

  describe('child logger', () => {
    it('should create child logger with additional context', async () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        metadata: { service: 'main' },
      });

      const childLogger = logger.child({ module: 'auth', userId: 123 });
      childLogger.info('Child log');

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      const metadata = capturedRequests.ingest[0].body.metadata as Record<string, unknown>;
      expect(metadata.service).toBe('main');
      expect(metadata.module).toBe('auth');
      expect(metadata.userId).toBe(123);
    });

    it('should not affect parent logger', async () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        metadata: { service: 'main' },
      });

      // Create child logger (we don't need to use it, just verify parent is unaffected)
      logger.child({ module: 'auth' });
      
      logger.info('Parent log');
      await vi.waitFor(() => expect(capturedRequests.ingest.length).toBe(1));
      
      const parentMetadata = capturedRequests.ingest[0].body.metadata as Record<string, unknown>;
      expect(parentMetadata.service).toBe('main');
      expect(parentMetadata.module).toBeUndefined();
    });
  });

  describe('debug mode', () => {
    it('should log to console when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        debug: true,
      });

      logger.info('Debug mode test');

      expect(consoleSpy).toHaveBeenCalledWith('[INFO]', 'Debug mode test', undefined);
      consoleSpy.mockRestore();
    });

    it('should not log to console when debug is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        debug: false,
      });

      logger.info('No debug test');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('environment detection', () => {
    it('should include environment info in log entries', async () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      logger.info('Environment test');

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      const env = capturedRequests.ingest[0].body.environment as Record<string, unknown>;
      expect(env).toBeDefined();
      expect(env.type).toBe('node');
    });
  });

  describe('metadata handling', () => {
    it('should merge global and local metadata', async () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
        metadata: { global: 'value', shared: 'global' },
      });

      logger.info('Test', { local: 'data', shared: 'local' });

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      const metadata = capturedRequests.ingest[0].body.metadata as Record<string, unknown>;
      // Global metadata should be present
      expect(metadata.global).toBe('value');
      // Local metadata should be present
      expect(metadata.local).toBe('data');
      // Local should override global for shared keys
      expect(metadata.shared).toBe('local');
    });

    it('should work without global metadata', async () => {
      const logger = createLogger({
        endpoint: 'http://localhost:3001/ingest',
        appName: 'test-app',
      });

      logger.info('Test', { local: 'data' });

      await vi.waitFor(() => {
        expect(capturedRequests.ingest.length).toBe(1);
      });

      const metadata = capturedRequests.ingest[0].body.metadata as Record<string, unknown>;
      expect(metadata.local).toBe('data');
    });
  });
});
