import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { swaggerUI } from '@hono/swagger-ui';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { WSContext, WSEvents } from 'hono/ws';
import { LogEntrySchema, LogQuerySchema, ErrorGroupQuerySchema, UpdateErrorGroupStatusSchema, TraceQuerySchema, type LogEntry } from './schemas';
import { openApiSpec } from './openapi';
import { 
  initRepository,
  getRepository,
  startCleanupJob,
  restartCleanupJob,
  type IRepository,
  type Trace,
  type Span,
  type RetentionSettings,
} from './db';

// Context type with repository
type Env = {
  Variables: {
    repo: IRepository;
  };
};

const app = new Hono<Env>();

// WebSocket setup
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Store connected WebSocket clients
const wsClients = new Set<WSContext>();

// Broadcast log to all connected clients
function broadcastLog(log: LogEntry) {
  const message = JSON.stringify({ type: 'log', data: log });
  for (const client of wsClients) {
    try {
      client.send(message);
    } catch (error) {
      console.error('[WS] Error broadcasting:', error);
      wsClients.delete(client);
    }
  }
}

// Inject repository into context
app.use('*', async (c, next) => {
  c.set('repo', getRepository());
  await next();
});

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));
app.use('*', logger());

// OpenAPI documentation endpoint
app.get('/doc', (c) => c.json(openApiSpec));

// Swagger UI
app.get('/ui', swaggerUI({ url: '/doc' }));

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'trace-dock',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    wsClients: wsClients.size,
  });
});

// WebSocket endpoint for live log streaming
app.get('/live', upgradeWebSocket((): WSEvents => ({
  onOpen(_event: Event, ws: WSContext) {
    wsClients.add(ws);
    console.log(`[WS] Client connected. Total: ${wsClients.size}`);
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to trace-dock live stream',
      timestamp: new Date().toISOString(),
    }));
  },
  onClose(_event: CloseEvent, ws: WSContext) {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${wsClients.size}`);
  },
  onError(error: Event, ws: WSContext) {
    console.error('[WS] Error:', error);
    wsClients.delete(ws);
  },
})));

// Ingest endpoint - receives logs from SDK
app.post('/ingest', async (c) => {
  try {
    const body = await c.req.json();
    
    // Debug: log received trace context
    if (body.traceId || body.spanId) {
      console.log('[DEBUG /ingest] Received trace context:', {
        traceId: body.traceId,
        spanId: body.spanId,
        parentSpanId: body.parentSpanId,
      });
    }
    
    const result = LogEntrySchema.safeParse(body);

    if (!result.success) {
      return c.json(
        { error: 'Invalid log entry', details: result.error.flatten() },
        400
      );
    }

    const log = result.data;
    const repo = c.get('repo');

    // Debug: log what we're inserting
    if (log.traceId || log.spanId) {
      console.log('[DEBUG /ingest] Inserting log with trace context:', {
        traceId: log.traceId,
        spanId: log.spanId,
        parentSpanId: log.parentSpanId,
      });
    }

    // Store in database
    repo.insertLog(log);

    // Broadcast to WebSocket clients
    broadcastLog(log);

    return c.json({ success: true, id: log.id });
  } catch (error) {
    console.error('Error ingesting log:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get logs with pagination and filtering
app.get('/logs', async (c) => {
  try {
    const query = c.req.query();
    const result = LogQuerySchema.safeParse({
      level: query.level,
      appName: query.appName,
      sessionId: query.sessionId,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
      traceId: query.traceId,
      spanId: query.spanId,
      limit: query.limit,
      offset: query.offset,
    });

    if (!result.success) {
      return c.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        400
      );
    }

    const repo = c.get('repo');
    const logs = repo.getLogs(result.data);
    return c.json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single log by ID
app.get('/logs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const repo = c.get('repo');
    const log = repo.getLogById(id);

    if (!log) {
      return c.json({ error: 'Log not found' }, 404);
    }

    return c.json(log);
  } catch (error) {
    console.error('Error fetching log:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get statistics
app.get('/stats', async (c) => {
  try {
    const repo = c.get('repo');
    const stats = repo.getStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get available app names
app.get('/apps', async (c) => {
  try {
    const repo = c.get('repo');
    const apps = repo.getAppNames();
    return c.json({ apps });
  } catch (error) {
    console.error('Error fetching apps:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get session IDs
app.get('/sessions', async (c) => {
  try {
    const appName = c.req.query('appName');
    const repo = c.get('repo');
    const sessions = repo.getSessionIds(appName);
    return c.json({ sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get search suggestions for autocomplete
app.get('/suggestions', async (c) => {
  try {
    const prefix = c.req.query('q') || '';
    const repo = c.get('repo');
    const suggestions = repo.getSearchSuggestions(prefix);
    return c.json({ suggestions });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get metadata keys for search help
app.get('/metadata-keys', async (c) => {
  try {
    const repo = c.get('repo');
    const keys = repo.getMetadataKeys();
    return c.json({ keys });
  } catch (error) {
    console.error('Error fetching metadata keys:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ==================== Error Groups API ====================

// Get error groups with pagination and filtering
app.get('/error-groups', async (c) => {
  try {
    const query = c.req.query();
    const result = ErrorGroupQuerySchema.safeParse({
      appName: query.appName,
      status: query.status,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      limit: query.limit,
      offset: query.offset,
    });

    if (!result.success) {
      return c.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        400
      );
    }

    const repo = c.get('repo');
    const errorGroups = repo.getErrorGroups(result.data);
    return c.json(errorGroups);
  } catch (error) {
    console.error('Error fetching error groups:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get error groups statistics - MUST be before /error-groups/:id
app.get('/error-groups/stats', async (c) => {
  try {
    const repo = c.get('repo');
    const stats = repo.getErrorGroupStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching error group stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single error group by ID
app.get('/error-groups/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const repo = c.get('repo');
    const errorGroup = repo.getErrorGroupById(id);

    if (!errorGroup) {
      return c.json({ error: 'Error group not found' }, 404);
    }

    return c.json(errorGroup);
  } catch (error) {
    console.error('Error fetching error group:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update error group status
app.patch('/error-groups/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = UpdateErrorGroupStatusSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        { error: 'Invalid request body', details: result.error.flatten() },
        400
      );
    }

    const repo = c.get('repo');
    const updated = repo.updateErrorGroupStatus(id, result.data.status);
    
    if (!updated) {
      return c.json({ error: 'Error group not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating error group status:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get occurrences (logs) for a specific error group
app.get('/error-groups/:id/occurrences', async (c) => {
  try {
    const id = c.req.param('id');
    const query = c.req.query();
    const limit = parseInt(query.limit || '50', 10);
    const offset = parseInt(query.offset || '0', 10);

    const repo = c.get('repo');
    const errorGroup = repo.getErrorGroupById(id);
    if (!errorGroup) {
      return c.json({ error: 'Error group not found' }, 404);
    }

    const occurrences = repo.getErrorGroupOccurrences(id, limit, offset);
    return c.json(occurrences);
  } catch (error) {
    console.error('Error fetching error group occurrences:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get logs with ignored errors handling
app.get('/logs-filtered', async (c) => {
  try {
    const query = c.req.query();
    const result = LogQuerySchema.safeParse({
      level: query.level,
      appName: query.appName,
      sessionId: query.sessionId,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
      traceId: query.traceId,
      spanId: query.spanId,
      limit: query.limit,
      offset: query.offset,
    });

    if (!result.success) {
      return c.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        400
      );
    }

    const repo = c.get('repo');
    const excludeIgnored = query.excludeIgnored === 'true';
    const logs = repo.getLogsWithIgnoredInfo({ ...result.data, excludeIgnored });
    return c.json(logs);
  } catch (error) {
    console.error('Error fetching filtered logs:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ==================== Traces API ====================

// Get traces with pagination and filtering
app.get('/traces', async (c) => {
  try {
    const query = c.req.query();
    const result = TraceQuerySchema.safeParse({
      serviceName: query.serviceName || query.appName,
      operationName: query.operationName || query.name,
      status: query.status,
      minDuration: query.minDuration,
      maxDuration: query.maxDuration,
      startDate: query.startDate,
      endDate: query.endDate,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });

    if (!result.success) {
      return c.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        400
      );
    }

    const repo = c.get('repo');
    // Map schema params to DB params
    const traces = repo.getTraces({
      appName: result.data.serviceName,
      name: result.data.operationName,
      status: result.data.status as 'running' | 'completed' | 'error' | undefined,
      minDuration: result.data.minDuration,
      maxDuration: result.data.maxDuration,
      startDate: result.data.startDate,
      endDate: result.data.endDate,
      limit: result.data.limit,
      offset: result.data.offset,
    });
    return c.json(traces);
  } catch (error) {
    console.error('Error fetching traces:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get trace statistics - MUST be before /traces/:id
app.get('/traces/stats', async (c) => {
  try {
    const repo = c.get('repo');
    const stats = repo.getTraceStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching trace stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single trace by ID with spans and logs
app.get('/traces/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const repo = c.get('repo');
    const traceDetails = repo.getTraceWithDetails(id);

    if (!traceDetails) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    return c.json(traceDetails);
  } catch (error) {
    console.error('Error fetching trace:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get spans for a trace
app.get('/traces/:id/spans', async (c) => {
  try {
    const id = c.req.param('id');
    const repo = c.get('repo');
    const trace = repo.getTraceById(id);

    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    const spans = repo.getSpansByTraceId(id);
    return c.json({ spans });
  } catch (error) {
    console.error('Error fetching trace spans:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create a new trace
app.post('/traces', async (c) => {
  try {
    const body = await c.req.json();
    const repo = c.get('repo');
    
    const trace: Omit<Trace, 'spanCount' | 'errorCount'> = {
      id: body.id || crypto.randomUUID(),
      name: body.name,
      appName: body.appName || body.serviceName,
      sessionId: body.sessionId,
      startTime: body.startTime || new Date().toISOString(),
      endTime: body.endTime || null,
      durationMs: body.durationMs || null,
      status: body.status || 'running',
      metadata: body.metadata,
    };

    const created = repo.createTrace(trace);
    return c.json(created, 201);
  } catch (error) {
    console.error('Error creating trace:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update a trace (end it or change status)
app.patch('/traces/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const repo = c.get('repo');

    const trace = repo.getTraceById(id);
    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    const updated = repo.updateTrace(id, {
      endTime: body.endTime,
      durationMs: body.durationMs,
      status: body.status,
      metadata: body.metadata,
    });

    if (!updated) {
      return c.json({ error: 'No updates applied' }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating trace:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create a new span
app.post('/spans', async (c) => {
  try {
    const body = await c.req.json();
    const repo = c.get('repo');
    
    const span: Span = {
      id: body.id || crypto.randomUUID(),
      traceId: body.traceId,
      parentSpanId: body.parentSpanId || null,
      name: body.name,
      operationType: body.operationType || null,
      startTime: body.startTime || new Date().toISOString(),
      endTime: body.endTime || null,
      durationMs: body.durationMs || null,
      status: body.status || 'running',
      metadata: body.metadata,
    };

    // Validate trace exists
    const trace = repo.getTraceById(span.traceId);
    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    const created = repo.createSpan(span);
    return c.json(created, 201);
  } catch (error) {
    console.error('Error creating span:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update a span (end it or change status)
app.patch('/spans/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const repo = c.get('repo');

    const updated = repo.updateSpan(id, {
      endTime: body.endTime,
      durationMs: body.durationMs,
      status: body.status,
      metadata: body.metadata,
    });

    if (!updated) {
      return c.json({ error: 'Span not found or no updates applied' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating span:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================
// Settings & Retention API
// ============================================

// Get current settings
app.get('/settings', (c) => {
  try {
    const repo = c.get('repo');
    const settings = repo.getSettings();
    return c.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update settings
app.patch('/settings', async (c) => {
  try {
    const body = await c.req.json() as Partial<RetentionSettings>;
    const repo = c.get('repo');
    const updatedSettings = repo.updateSettings(body);
    
    // Restart cleanup job if cleanup settings changed
    if (body.cleanupEnabled !== undefined || body.cleanupIntervalHours !== undefined) {
      restartCleanupJob();
    }
    
    return c.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get storage statistics
app.get('/settings/stats', (c) => {
  try {
    const repo = c.get('repo');
    const stats = repo.getStorageStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error getting storage stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Run manual cleanup
app.post('/settings/cleanup', (c) => {
  try {
    const repo = c.get('repo');
    const result = repo.runCleanup();
    return c.json(result);
  } catch (error) {
    console.error('Error running cleanup:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Purge all data
app.post('/settings/purge', (c) => {
  try {
    const repo = c.get('repo');
    const result = repo.purgeAllData();
    return c.json(result);
  } catch (error) {
    console.error('Error purging data:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Start server
const PORT = parseInt(process.env.PORT || '3001', 10);

// Initialize and start
async function main() {
  // Initialize repository first
  await initRepository();
  console.log('[DB] Repository initialized');

  const server = serve({
    fetch: app.fetch,
    port: PORT,
  }, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                     TRACE-DOCK                        ║
║                   Server Started                      ║
╠═══════════════════════════════════════════════════════╣
║  HTTP API:    http://localhost:${PORT}                   ║
║  WebSocket:   ws://localhost:${PORT}/live                ║
║  Health:      http://localhost:${PORT}/                  ║
║  Swagger UI:  http://localhost:${PORT}/ui                ║
║  OpenAPI:     http://localhost:${PORT}/doc               ║
╚═══════════════════════════════════════════════════════╝
    `);
    
    // Start automatic cleanup job
    startCleanupJob();
  });

  // Inject WebSocket support
  injectWebSocket(server);
}

main().catch(console.error);

export default app;
