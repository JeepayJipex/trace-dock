import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { WSContext, WSEvents } from 'hono/ws';
import { LogEntrySchema, LogQuerySchema, type LogEntry } from './schemas';
import { insertLogEntry, getLogs, getLogById, getStats, getAppNames, getSessionIds } from './db';

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
  allowMethods: ['GET', 'POST', 'OPTIONS'],
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
