import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import type { LogEntry } from '../schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../../data');
const DB_PATH = process.env.DB_PATH || join(DATA_DIR, 'trace-dock.sqlite');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    app_name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    metadata TEXT,
    stack_trace TEXT,
    context TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
  CREATE INDEX IF NOT EXISTS idx_logs_app_name ON logs(app_name);
  CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);
`);

// Create FTS table for full-text search (includes metadata and stack_trace)
// Drop and recreate to ensure correct schema
db.exec(`
  DROP TABLE IF EXISTS logs_fts;
  
  CREATE VIRTUAL TABLE logs_fts USING fts5(
    id,
    message,
    app_name,
    metadata,
    stack_trace,
    content='logs',
    content_rowid='rowid'
  );

  -- Drop existing triggers if they exist (to recreate with new columns)
  DROP TRIGGER IF EXISTS logs_ai;
  DROP TRIGGER IF EXISTS logs_ad;
  DROP TRIGGER IF EXISTS logs_au;
`);

// Recreate triggers with metadata and stack_trace
db.exec(`
  DROP TRIGGER IF EXISTS logs_ai;
  DROP TRIGGER IF EXISTS logs_ad;
  DROP TRIGGER IF EXISTS logs_au;

  CREATE TRIGGER logs_ai AFTER INSERT ON logs BEGIN
    INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
    VALUES (NEW.rowid, NEW.id, NEW.message, NEW.app_name, COALESCE(NEW.metadata, ''), COALESCE(NEW.stack_trace, ''));
  END;

  CREATE TRIGGER logs_ad AFTER DELETE ON logs BEGIN
    INSERT INTO logs_fts(logs_fts, rowid, id, message, app_name, metadata, stack_trace)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.message, OLD.app_name, COALESCE(OLD.metadata, ''), COALESCE(OLD.stack_trace, ''));
  END;

  CREATE TRIGGER logs_au AFTER UPDATE ON logs BEGIN
    INSERT INTO logs_fts(logs_fts, rowid, id, message, app_name, metadata, stack_trace)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.message, OLD.app_name, COALESCE(OLD.metadata, ''), COALESCE(OLD.stack_trace, ''));
    INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
    VALUES (NEW.rowid, NEW.id, NEW.message, NEW.app_name, COALESCE(NEW.metadata, ''), COALESCE(NEW.stack_trace, ''));
  END;
`);

// Rebuild FTS index from existing data
db.exec(`
  INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
  SELECT rowid, id, message, app_name, COALESCE(metadata, ''), COALESCE(stack_trace, '')
  FROM logs;
`);

// Prepared statements
const insertLog = db.prepare(`
  INSERT INTO logs (id, timestamp, level, message, app_name, session_id, environment, metadata, stack_trace, context)
  VALUES (@id, @timestamp, @level, @message, @appName, @sessionId, @environment, @metadata, @stackTrace, @context)
`);

const selectLogs = db.prepare(`
  SELECT * FROM logs
  ORDER BY timestamp DESC
  LIMIT ? OFFSET ?
`);

const selectLogById = db.prepare(`
  SELECT * FROM logs WHERE id = ?
`);

const countLogs = db.prepare(`
  SELECT COUNT(*) as total FROM logs
`);

export interface LogsQueryParams {
  level?: string;
  appName?: string;
  sessionId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit: number;
  offset: number;
}

export interface PaginatedLogs {
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Parse advanced search query like Datadog/Sentry
 * Supports: level:error app:myapp key:value freetext
 * Returns extracted filters and remaining free text
 */
function parseSearchQuery(search: string): {
  filters: Record<string, string>;
  freeText: string;
} {
  const filters: Record<string, string> = {};
  
  // Match patterns like key:value or key:"value with spaces"
  const filterRegex = /(\w+):(?:"([^"]+)"|(\S+))/g;
  let match;
  let remaining = search;
  
  while ((match = filterRegex.exec(search)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] || match[3]; // quoted or unquoted value
    filters[key] = value;
    remaining = remaining.replace(match[0], '');
  }
  
  return {
    filters,
    freeText: remaining.trim(),
  };
}

function parseLogRow(row: Record<string, unknown>): LogEntry {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    level: row.level as LogEntry['level'],
    message: row.message as string,
    appName: row.app_name as string,
    sessionId: row.session_id as string,
    environment: JSON.parse(row.environment as string),
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    stackTrace: row.stack_trace as string | undefined,
    context: row.context ? JSON.parse(row.context as string) : undefined,
  };
}

export function insertLogEntry(log: LogEntry): void {
  insertLog.run({
    id: log.id,
    timestamp: log.timestamp,
    level: log.level,
    message: log.message,
    appName: log.appName,
    sessionId: log.sessionId,
    environment: JSON.stringify(log.environment),
    metadata: log.metadata ? JSON.stringify(log.metadata) : null,
    stackTrace: log.stackTrace || null,
    context: log.context ? JSON.stringify(log.context) : null,
  });
}

export function getLogs(params: LogsQueryParams): PaginatedLogs {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // Parse advanced search syntax
  let freeTextSearch = '';
  if (params.search) {
    const { filters, freeText } = parseSearchQuery(params.search);
    freeTextSearch = freeText;
    
    // Apply extracted filters
    if (filters.level && !params.level) {
      params.level = filters.level;
    }
    if (filters.app && !params.appName) {
      params.appName = filters.app;
    }
    if (filters.session && !params.sessionId) {
      params.sessionId = filters.session;
    }
    
    // Handle metadata filters (any key:value that's not a reserved word)
    const reservedKeys = ['level', 'app', 'session', 'from', 'to'];
    for (const [key, value] of Object.entries(filters)) {
      if (!reservedKeys.includes(key)) {
        // Search in metadata JSON
        conditions.push(`(metadata LIKE ? OR message LIKE ?)`);
        const pattern = `%"${key}"%${value}%`;
        const messagePattern = `%${key}%${value}%`;
        values.push(pattern, messagePattern);
      }
    }
  }

  if (params.level) {
    conditions.push('level = ?');
    values.push(params.level);
  }

  if (params.appName) {
    conditions.push('app_name = ?');
    values.push(params.appName);
  }

  if (params.sessionId) {
    conditions.push('session_id = ?');
    values.push(params.sessionId);
  }

  if (params.startDate) {
    conditions.push('timestamp >= ?');
    values.push(params.startDate);
  }

  if (params.endDate) {
    conditions.push('timestamp <= ?');
    values.push(params.endDate);
  }

  let query = 'SELECT * FROM logs';
  let countQuery = 'SELECT COUNT(*) as total FROM logs';

  // Use FTS for free text search
  if (freeTextSearch) {
    // Escape special FTS characters and add prefix matching
    const escapedSearch = freeTextSearch
      .replace(/['"]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map(term => `"${term}"*`)
      .join(' ');
    
    if (escapedSearch) {
      query = `
        SELECT logs.* FROM logs
        INNER JOIN logs_fts ON logs.id = logs_fts.id
        WHERE logs_fts MATCH ?
      `;
      countQuery = `
        SELECT COUNT(*) as total FROM logs
        INNER JOIN logs_fts ON logs.id = logs_fts.id
        WHERE logs_fts MATCH ?
      `;
      values.unshift(escapedSearch);
      
      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
        countQuery += ' AND ' + conditions.join(' AND ');
      }
    } else if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
  } else if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';

  const countStmt = db.prepare(countQuery);
  const queryStmt = db.prepare(query);

  // Count values exclude limit and offset
  const countValues = freeTextSearch 
    ? values.slice(0, values.length)
    : values;
  
  const total = (countStmt.get(...countValues) as { total: number }).total;

  const rows = queryStmt.all(...values, params.limit, params.offset) as Record<string, unknown>[];
  const logs = rows.map(parseLogRow);

  return {
    logs,
    total,
    limit: params.limit,
    offset: params.offset,
  };
}

export function getLogById(id: string): LogEntry | null {
  const row = selectLogById.get(id) as Record<string, unknown> | undefined;
  return row ? parseLogRow(row) : null;
}

export function getRecentLogs(limit = 50): LogEntry[] {
  const rows = selectLogs.all(limit, 0) as Record<string, unknown>[];
  return rows.map(parseLogRow);
}

export function getStats(): { total: number; byLevel: Record<string, number>; byApp: Record<string, number> } {
  const total = (countLogs.get() as { total: number }).total;
  
  const byLevelRows = db.prepare('SELECT level, COUNT(*) as count FROM logs GROUP BY level').all() as { level: string; count: number }[];
  const byLevel = Object.fromEntries(byLevelRows.map(r => [r.level, r.count]));
  
  const byAppRows = db.prepare('SELECT app_name, COUNT(*) as count FROM logs GROUP BY app_name').all() as { app_name: string; count: number }[];
  const byApp = Object.fromEntries(byAppRows.map(r => [r.app_name, r.count]));
  
  return { total, byLevel, byApp };
}

export function getAppNames(): string[] {
  const rows = db.prepare('SELECT DISTINCT app_name FROM logs ORDER BY app_name').all() as { app_name: string }[];
  return rows.map(r => r.app_name);
}

export function getSessionIds(appName?: string): string[] {
  let query = 'SELECT DISTINCT session_id FROM logs';
  if (appName) {
    query += ' WHERE app_name = ?';
  }
  query += ' ORDER BY session_id DESC LIMIT 100';
  
  const stmt = db.prepare(query);
  const rows = (appName ? stmt.all(appName) : stmt.all()) as { session_id: string }[];
  return rows.map(r => r.session_id);
}

/**
 * Get unique metadata keys from recent logs for autocomplete
 */
export function getMetadataKeys(): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT metadata FROM logs 
    WHERE metadata IS NOT NULL 
    ORDER BY created_at DESC 
    LIMIT 500
  `).all() as { metadata: string }[];
  
  const keysSet = new Set<string>();
  for (const row of rows) {
    try {
      const metadata = JSON.parse(row.metadata);
      for (const key of Object.keys(metadata)) {
        keysSet.add(key);
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  return Array.from(keysSet).sort();
}

/**
 * Get search suggestions based on recent values
 */
export function getSearchSuggestions(prefix: string): { type: string; value: string }[] {
  const suggestions: { type: string; value: string }[] = [];
  const lowerPrefix = prefix.toLowerCase();
  
  // App name suggestions
  const apps = getAppNames();
  for (const app of apps) {
    if (app.toLowerCase().includes(lowerPrefix)) {
      suggestions.push({ type: 'app', value: `app:${app}` });
    }
  }
  
  // Level suggestions
  const levels = ['debug', 'info', 'warn', 'error'];
  for (const level of levels) {
    if (level.includes(lowerPrefix)) {
      suggestions.push({ type: 'level', value: `level:${level}` });
    }
  }
  
  // Metadata key suggestions
  const metadataKeys = getMetadataKeys();
  for (const key of metadataKeys) {
    if (key.toLowerCase().includes(lowerPrefix)) {
      suggestions.push({ type: 'metadata', value: `${key}:` });
    }
  }
  
  return suggestions.slice(0, 10);
}

export { db };
