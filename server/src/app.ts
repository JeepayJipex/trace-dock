import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from 'hono/adapter';
import { LogEntrySchema, LogQuerySchema, ErrorGroupQuerySchema, UpdateErrorGroupStatusSchema } from './schemas';
import { getRepository, type IRepository } from './db';
import { wsManager } from './websocket';

// Default allowed origins for development
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173'];

// Context type with repository
type Env = {
  Variables: {
    repo: IRepository;
  };
};

const app = new Hono<Env>();

// Inject repository into context
app.use('*', async (c, next) => {
  c.set('repo', getRepository());
  await next();
});

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
    const repo = c.get('repo');

    // Store in database
    repo.insertLog(log);

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

// Get error groups statistics
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

export default app;
