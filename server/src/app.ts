import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from 'hono/adapter';
import { LogEntrySchema, LogQuerySchema } from './schemas';
import { insertLogEntry, getLogs, getLogById, getStats, getAppNames, getSessionIds } from './db';
import { wsManager } from './websocket';

// Default allowed origins for development
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173'];

const app = new Hono();

// Dynamic CORS middleware - reads CORS_ORIGINS from environment
// Compatible with all runtimes: Node.js, Bun, Deno, Cloudflare Workers, etc.
app.use('*', async (c, next) => {
  // Get environment variables using Hono's universal env() adapter
  const { CORS_ORIGINS, CORS_ALLOW_ALL } = env<{
    CORS_ORIGINS?: string;
    CORS_ALLOW_ALL?: string;
  }>(c);

  // Parse allowed origins from environment
  // CORS_ORIGINS can be a comma-separated list: "https://app.example.com,https://admin.example.com"
  // CORS_ALLOW_ALL=true allows all origins (use with caution!)
  let allowedOrigins: string[] | ((origin: string) => string | undefined | null);

  if (CORS_ALLOW_ALL === 'true') {
    // Allow all origins - useful for development or public APIs
    allowedOrigins = (origin: string) => origin;
  } else if (CORS_ORIGINS) {
    // Parse comma-separated origins and trim whitespace
    allowedOrigins = CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
    // Merge with defaults if not empty
    if (allowedOrigins.length === 0) {
      allowedOrigins = DEFAULT_ORIGINS;
    }
  } else {
    // Use default origins for development
    allowedOrigins = DEFAULT_ORIGINS;
  }

  const corsMiddleware = cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  });

  return corsMiddleware(c, next);
});

app.use('*', logger());

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'trace-dock',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    wsClients: wsManager.getClientCount(),
  });
});

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
    wsManager.broadcast(log);

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

export default app;
