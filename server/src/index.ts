import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { WSContext, WSEvents } from 'hono/ws';
import { LogEntrySchema, LogQuerySchema, ErrorGroupQuerySchema, UpdateErrorGroupStatusSchema, TraceQuerySchema, type LogEntry } from './schemas';
import { 
  insertLogEntry, 
  getLogs, 
  getLogById, 
  getStats, 
  getAppNames, 
  getSessionIds,
  getSearchSuggestions,
  getMetadataKeys,
  getErrorGroups,
  getErrorGroupById,
  updateErrorGroupStatus,
  getErrorGroupOccurrences,
  getErrorGroupStats,
  getLogsWithIgnoredInfo,
  getTraces,
  getTraceById,
  getSpansByTraceId,
  createTrace,
  updateTrace,
  createSpan,
  updateSpan,
  getTraceStats,
  getTraceWithDetails,
  type Trace,
  type Span,
} from './db';

const app = new Hono();

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

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));
app.use('*', logger());

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
    const result = LogEntrySchema.safeParse(body);

    if (!result.success) {
      return c.json(
        { error: 'Invalid log entry', details: result.error.flatten() },
        400
      );
    }

    const log = result.data;

    // Store in database
    insertLogEntry(log);

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
      limit: query.limit,
      offset: query.offset,
    });

    if (!result.success) {
      return c.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        400
      );
    }

    const logs = getLogs(result.data);
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
    const log = getLogById(id);

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
    const stats = getStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get available app names
app.get('/apps', async (c) => {
  try {
    const apps = getAppNames();
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
    const sessions = getSessionIds(appName);
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
    const suggestions = getSearchSuggestions(prefix);
    return c.json({ suggestions });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get metadata keys for search help
app.get('/metadata-keys', async (c) => {
  try {
    const keys = getMetadataKeys();
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

    const errorGroups = getErrorGroups(result.data);
    return c.json(errorGroups);
  } catch (error) {
    console.error('Error fetching error groups:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get error groups statistics - MUST be before /error-groups/:id
app.get('/error-groups/stats', async (c) => {
  try {
    const stats = getErrorGroupStats();
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
    const errorGroup = getErrorGroupById(id);

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

    const updated = updateErrorGroupStatus(id, result.data.status);
    
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

    const errorGroup = getErrorGroupById(id);
    if (!errorGroup) {
      return c.json({ error: 'Error group not found' }, 404);
    }

    const occurrences = getErrorGroupOccurrences(id, limit, offset);
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
      limit: query.limit,
      offset: query.offset,
    });

    if (!result.success) {
      return c.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        400
      );
    }

    const excludeIgnored = query.excludeIgnored === 'true';
    const logs = getLogsWithIgnoredInfo({ ...result.data, excludeIgnored });
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

    // Map schema params to DB params
    const traces = getTraces({
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
    const stats = getTraceStats();
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
    const traceDetails = getTraceWithDetails(id);

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
    const trace = getTraceById(id);

    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    const spans = getSpansByTraceId(id);
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

    const created = createTrace(trace);
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

    const trace = getTraceById(id);
    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    const updated = updateTrace(id, {
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
    const trace = getTraceById(span.traceId);
    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    const created = createSpan(span);
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

    const updated = updateSpan(id, {
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

// Start server
const PORT = parseInt(process.env.PORT || '3001', 10);

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
╚═══════════════════════════════════════════════════════╝
  `);
});

// Inject WebSocket support
injectWebSocket(server);

export default app;
