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

// Create FTS table for full-text search
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
    id,
    message,
    app_name,
    content='logs',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS logs_ai AFTER INSERT ON logs BEGIN
    INSERT INTO logs_fts(rowid, id, message, app_name)
    VALUES (NEW.rowid, NEW.id, NEW.message, NEW.app_name);
  END;

  CREATE TRIGGER IF NOT EXISTS logs_ad AFTER DELETE ON logs BEGIN
    INSERT INTO logs_fts(logs_fts, rowid, id, message, app_name)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.message, OLD.app_name);
  END;

  CREATE TRIGGER IF NOT EXISTS logs_au AFTER UPDATE ON logs BEGIN
    INSERT INTO logs_fts(logs_fts, rowid, id, message, app_name)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.message, OLD.app_name);
    INSERT INTO logs_fts(rowid, id, message, app_name)
    VALUES (NEW.rowid, NEW.id, NEW.message, NEW.app_name);
  END;
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

  if (params.search) {
    // Use FTS for search
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
    values.unshift(params.search + '*');
    
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
      countQuery += ' AND ' + conditions.join(' AND ');
    }
  } else if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';

  const countStmt = db.prepare(countQuery);
  const queryStmt = db.prepare(query);

  const countValues = params.search ? values.slice(0, -0 || values.length) : values;
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

export { db };
