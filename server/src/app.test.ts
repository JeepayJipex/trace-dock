import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SQLiteRepository } from './db/sqlite-drizzle.repository';
import { setRepository, closeRepository, type IRepository } from './db';
import type { LogEntry } from './schemas';

// Helper to create an in-memory repository for testing
function createTestRepository(): IRepository {
  return new SQLiteRepository(':memory:', { runMigrations: true });
}

describe('Server API Routes', () => {
  describe('Health check', () => {
    it('should return server info', async () => {
      const app = new Hono();
      app.get('/', (c) => c.json({
        name: 'trace-dock',
        version: '1.0.0',
        status: 'healthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        wsClients: 0,
      }));

      const res = await app.request('/');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.name).toBe('trace-dock');
      expect(data.status).toBe('healthy');
    });
  });

  describe('Ingest endpoint', () => {
    it('should accept valid log entry', async () => {
      const app = new Hono();
      const ingestedLogs: unknown[] = [];
      
      app.post('/ingest', async (c) => {
        const body = await c.req.json();
        
        // Validate required fields
        if (!body.id || !body.timestamp || !body.level || !body.message || !body.appName || !body.sessionId) {
          return c.json({ error: 'Invalid log entry' }, 400);
        }
        
        ingestedLogs.push(body);
        return c.json({ success: true, id: body.id });
      });

      const logEntry = {
        id: 'test-123',
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        message: 'Test message',
        appName: 'test-app',
        sessionId: 'session-1',
        environment: { type: 'node', version: '20.0.0' },
      };

      const res = await app.request('/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.id).toBe('test-123');
      expect(ingestedLogs.length).toBe(1);
    });

    it('should reject invalid log entry', async () => {
      const app = new Hono();
      
      app.post('/ingest', async (c) => {
        const body = await c.req.json();
        
        if (!body.id || !body.timestamp) {
          return c.json({ error: 'Invalid log entry' }, 400);
        }
        
        return c.json({ success: true });
      });

      const res = await app.request('/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid log entry');
    });
  });

  describe('CORS configuration', () => {
    it('should set CORS headers for allowed origins', async () => {
      const app = new Hono();
      
      app.use('*', cors({
        origin: ['http://localhost:5173'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
      }));
      
      app.get('/test', (c) => c.json({ test: true }));

      const res = await app.request('/test', {
        headers: { 'Origin': 'http://localhost:5173' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });
  });

  describe('Logs endpoint', () => {
    it('should return paginated logs', async () => {
      const app = new Hono();
      const mockLogs = [
        { id: '1', message: 'Log 1', level: 'info', timestamp: '2024-01-01T00:00:00Z' },
        { id: '2', message: 'Log 2', level: 'error', timestamp: '2024-01-01T00:01:00Z' },
      ];

      app.get('/logs', (c) => {
        const limit = parseInt(c.req.query('limit') || '50');
        const offset = parseInt(c.req.query('offset') || '0');
        
        return c.json({
          logs: mockLogs.slice(offset, offset + limit),
          total: mockLogs.length,
          limit,
          offset,
        });
      });

      const res = await app.request('/logs?limit=10&offset=0');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.logs).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
    });

    it('should filter logs by level', async () => {
      const app = new Hono();
      const mockLogs = [
        { id: '1', message: 'Log 1', level: 'info' },
        { id: '2', message: 'Log 2', level: 'error' },
        { id: '3', message: 'Log 3', level: 'error' },
      ];

      app.get('/logs', (c) => {
        const level = c.req.query('level');
        const filtered = level 
          ? mockLogs.filter(l => l.level === level)
          : mockLogs;
        
        return c.json({
          logs: filtered,
          total: filtered.length,
          limit: 50,
          offset: 0,
        });
      });

      const res = await app.request('/logs?level=error');
      const data = await res.json();
      
      expect(data.logs).toHaveLength(2);
      expect(data.logs.every((l: { level: string }) => l.level === 'error')).toBe(true);
    });
  });

  describe('Single log endpoint', () => {
    it('should return log by ID', async () => {
      const app = new Hono();
      const mockLog = { 
        id: 'abc123', 
        message: 'Test', 
        level: 'info',
        timestamp: '2024-01-01T00:00:00Z',
      };

      app.get('/logs/:id', (c) => {
        const id = c.req.param('id');
        if (id === 'abc123') {
          return c.json(mockLog);
        }
        return c.json({ error: 'Log not found' }, 404);
      });

      const res = await app.request('/logs/abc123');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.id).toBe('abc123');
    });

    it('should return 404 for non-existent log', async () => {
      const app = new Hono();

      app.get('/logs/:id', (c) => {
        return c.json({ error: 'Log not found' }, 404);
      });

      const res = await app.request('/logs/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('Stats endpoint', () => {
    it('should return statistics', async () => {
      const app = new Hono();

      app.get('/stats', (c) => {
        return c.json({
          total: 100,
          byLevel: { debug: 10, info: 50, warn: 30, error: 10 },
          byApp: { 'app-1': 60, 'app-2': 40 },
        });
      });

      const res = await app.request('/stats');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(100);
      expect(data.byLevel.info).toBe(50);
      expect(data.byApp['app-1']).toBe(60);
    });
  });

  describe('Error groups endpoints', () => {
    it('should return paginated error groups', async () => {
      const app = new Hono();
      const mockGroups = [
        { id: 'group-1', message: 'Error 1', occurrenceCount: 5 },
        { id: 'group-2', message: 'Error 2', occurrenceCount: 10 },
      ];

      app.get('/error-groups', (c) => {
        return c.json({
          errorGroups: mockGroups,
          total: mockGroups.length,
          limit: 50,
          offset: 0,
        });
      });

      const res = await app.request('/error-groups');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.errorGroups).toHaveLength(2);
    });

    it('should update error group status', async () => {
      const app = new Hono();
      let groupStatus = 'unreviewed';

      app.patch('/error-groups/:id/status', async (c) => {
        const body = await c.req.json();
        if (!['unreviewed', 'reviewed', 'ignored', 'resolved'].includes(body.status)) {
          return c.json({ error: 'Invalid status' }, 400);
        }
        groupStatus = body.status;
        return c.json({ success: true });
      });

      const res = await app.request('/error-groups/group-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      expect(res.status).toBe(200);
      expect(groupStatus).toBe('resolved');
    });
  });

  describe('Apps and Sessions endpoints', () => {
    it('should return list of app names', async () => {
      const app = new Hono();

      app.get('/apps', (c) => {
        return c.json({ apps: ['app-1', 'app-2', 'app-3'] });
      });

      const res = await app.request('/apps');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.apps).toContain('app-1');
      expect(data.apps).toHaveLength(3);
    });

    it('should return session IDs', async () => {
      const app = new Hono();

      app.get('/sessions', (c) => {
        return c.json({ sessions: ['session-1', 'session-2'] });
      });

      const res = await app.request('/sessions');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.sessions).toHaveLength(2);
    });
  });
});

describe('Repository Integration', () => {
  let repo: IRepository;

  beforeEach(() => {
    repo = createTestRepository();
    setRepository(repo);
  });

  afterEach(() => {
    closeRepository();
  });

  describe('Logs', () => {
    const createTestLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Test log message',
      appName: 'test-app',
      sessionId: 'session-1',
      environment: { type: 'node' },
      ...overrides,
    });

    it('should insert and retrieve a log', () => {
      const log = createTestLog();
      repo.insertLog(log);
      
      const retrieved = repo.getLogById(log.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(log.id);
      expect(retrieved?.message).toBe(log.message);
    });

    it('should return paginated logs', () => {
      for (let i = 0; i < 10; i++) {
        repo.insertLog(createTestLog({ message: `Log ${i}` }));
      }

      const result = repo.getLogs({ limit: 5, offset: 0 });
      expect(result.logs).toHaveLength(5);
      expect(result.total).toBe(10);
    });

    it('should filter logs by level', () => {
      repo.insertLog(createTestLog({ level: 'info' }));
      repo.insertLog(createTestLog({ level: 'error' }));
      repo.insertLog(createTestLog({ level: 'error' }));

      const result = repo.getLogs({ level: 'error', limit: 50, offset: 0 });
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every(l => l.level === 'error')).toBe(true);
    });

    it('should filter logs by app name', () => {
      repo.insertLog(createTestLog({ appName: 'app-1' }));
      repo.insertLog(createTestLog({ appName: 'app-2' }));
      repo.insertLog(createTestLog({ appName: 'app-1' }));

      const result = repo.getLogs({ appName: 'app-1', limit: 50, offset: 0 });
      expect(result.logs).toHaveLength(2);
    });

    it('should return stats', () => {
      repo.insertLog(createTestLog({ level: 'info', appName: 'app-1' }));
      repo.insertLog(createTestLog({ level: 'error', appName: 'app-1' }));
      repo.insertLog(createTestLog({ level: 'info', appName: 'app-2' }));

      const stats = repo.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byLevel.info).toBe(2);
      expect(stats.byLevel.error).toBe(1);
      expect(stats.byApp['app-1']).toBe(2);
    });
  });

  describe('Error Groups', () => {
    const createErrorLog = (message: string): LogEntry => ({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      appName: 'test-app',
      sessionId: 'session-1',
      environment: { type: 'node' },
      stackTrace: 'Error\n    at test (/app/test.js:1:1)',
    });

    it('should create error group for error logs', () => {
      const log = createErrorLog('Database connection failed');
      const result = repo.insertLog(log);
      
      expect(result.errorGroupId).toBeDefined();
      
      const group = repo.getErrorGroupById(result.errorGroupId!);
      expect(group).not.toBeNull();
      expect(group?.message).toBe('Database connection failed');
    });

    it('should group similar errors', () => {
      repo.insertLog(createErrorLog('Connection failed to server'));
      repo.insertLog(createErrorLog('Connection failed to server'));

      const groups = repo.getErrorGroups({ limit: 50, offset: 0 });
      expect(groups.total).toBe(1);
      expect(groups.errorGroups[0].occurrenceCount).toBe(2);
    });

    it('should update error group status', () => {
      const log = createErrorLog('Test error');
      const result = repo.insertLog(log);
      
      const updated = repo.updateErrorGroupStatus(result.errorGroupId!, 'resolved');
      expect(updated).toBe(true);
      
      const group = repo.getErrorGroupById(result.errorGroupId!);
      expect(group?.status).toBe('resolved');
    });
  });

  describe('Traces and Spans', () => {
    it('should create and retrieve a trace', () => {
      const trace = repo.createTrace({
        id: crypto.randomUUID(),
        name: 'test-operation',
        appName: 'test-app',
        sessionId: 'session-1',
        startTime: new Date().toISOString(),
        endTime: null,
        durationMs: null,
        status: 'running',
      });

      const retrieved = repo.getTraceById(trace.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('test-operation');
    });

    it('should create spans and update trace span count', () => {
      const trace = repo.createTrace({
        id: crypto.randomUUID(),
        name: 'test-operation',
        appName: 'test-app',
        sessionId: 'session-1',
        startTime: new Date().toISOString(),
        endTime: null,
        durationMs: null,
        status: 'running',
      });

      repo.createSpan({
        id: crypto.randomUUID(),
        traceId: trace.id,
        parentSpanId: null,
        name: 'child-span',
        operationType: 'http',
        startTime: new Date().toISOString(),
        endTime: null,
        durationMs: null,
        status: 'running',
      });

      const updatedTrace = repo.getTraceById(trace.id);
      expect(updatedTrace?.spanCount).toBe(1);
    });

    it('should update trace status', () => {
      const trace = repo.createTrace({
        id: crypto.randomUUID(),
        name: 'test-operation',
        appName: 'test-app',
        sessionId: 'session-1',
        startTime: new Date().toISOString(),
        endTime: null,
        durationMs: null,
        status: 'running',
      });

      const updated = repo.updateTrace(trace.id, {
        status: 'completed',
        endTime: new Date().toISOString(),
        durationMs: 100,
      });

      expect(updated).toBe(true);
      
      const retrieved = repo.getTraceById(trace.id);
      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.durationMs).toBe(100);
    });
  });

  describe('Settings', () => {
    it('should return default settings', () => {
      const settings = repo.getSettings();
      expect(settings.logsRetentionDays).toBe(7);
      expect(settings.cleanupEnabled).toBe(true);
    });

    it('should update settings', () => {
      const updated = repo.updateSettings({ logsRetentionDays: 14 });
      expect(updated.logsRetentionDays).toBe(14);
      
      const settings = repo.getSettings();
      expect(settings.logsRetentionDays).toBe(14);
    });
  });

  describe('Storage Stats', () => {
    it('should return storage stats', () => {
      repo.insertLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test',
        appName: 'test-app',
        sessionId: 'session-1',
        environment: { type: 'node' },
      });

      const stats = repo.getStorageStats();
      expect(stats.totalLogs).toBe(1);
      expect(stats.totalTraces).toBe(0);
      expect(stats.databaseSizeBytes).toBeGreaterThan(0);
    });
  });
});
