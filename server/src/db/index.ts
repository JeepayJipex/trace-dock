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

// Create base tables first (without error_group_id to allow migration)
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

// Migration: Add error_group_id column if it doesn't exist
const columns = db.prepare("PRAGMA table_info(logs)").all() as { name: string }[];
const hasErrorGroupId = columns.some(col => col.name === 'error_group_id');

if (!hasErrorGroupId) {
  console.log('Migrating database: adding error_group_id column to logs table...');
  db.exec(`ALTER TABLE logs ADD COLUMN error_group_id TEXT`);
  console.log('Migration complete.');
}

// Create index for error_group_id (will be ignored if already exists)
db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_error_group_id ON logs(error_group_id)`);

// Migration: Add trace_id and span_id columns if they don't exist
const columnsAfterMigration = db.prepare("PRAGMA table_info(logs)").all() as { name: string }[];
const hasTraceId = columnsAfterMigration.some(col => col.name === 'trace_id');
const hasSpanId = columnsAfterMigration.some(col => col.name === 'span_id');
const hasParentSpanId = columnsAfterMigration.some(col => col.name === 'parent_span_id');

if (!hasTraceId) {
  console.log('Migrating database: adding trace_id column to logs table...');
  db.exec(`ALTER TABLE logs ADD COLUMN trace_id TEXT`);
}
if (!hasSpanId) {
  console.log('Migrating database: adding span_id column to logs table...');
  db.exec(`ALTER TABLE logs ADD COLUMN span_id TEXT`);
}
if (!hasParentSpanId) {
  console.log('Migrating database: adding parent_span_id column to logs table...');
  db.exec(`ALTER TABLE logs ADD COLUMN parent_span_id TEXT`);
}

// Create indexes for trace columns
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id);
  CREATE INDEX IF NOT EXISTS idx_logs_span_id ON logs(span_id);
`);

// Create traces table
db.exec(`
  CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_ms INTEGER,
    status TEXT DEFAULT 'running',
    span_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_traces_app_name ON traces(app_name);
  CREATE INDEX IF NOT EXISTS idx_traces_session_id ON traces(session_id);
  CREATE INDEX IF NOT EXISTS idx_traces_start_time ON traces(start_time DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
`);

// Create spans table
db.exec(`
  CREATE TABLE IF NOT EXISTS spans (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    parent_span_id TEXT,
    name TEXT NOT NULL,
    operation_type TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_ms INTEGER,
    status TEXT DEFAULT 'running',
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (trace_id) REFERENCES traces(id)
  );

  CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
  CREATE INDEX IF NOT EXISTS idx_spans_parent_span_id ON spans(parent_span_id);
  CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time);
`);

// Create error_groups table
db.exec(`
  -- Error groups table for grouping similar errors
  CREATE TABLE IF NOT EXISTS error_groups (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    message TEXT NOT NULL,
    app_name TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    status TEXT DEFAULT 'unreviewed',
    stack_trace_preview TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_error_groups_fingerprint ON error_groups(fingerprint);
  CREATE INDEX IF NOT EXISTS idx_error_groups_status ON error_groups(status);
  CREATE INDEX IF NOT EXISTS idx_error_groups_app_name ON error_groups(app_name);
  CREATE INDEX IF NOT EXISTS idx_error_groups_last_seen ON error_groups(last_seen DESC);
  CREATE INDEX IF NOT EXISTS idx_error_groups_occurrence_count ON error_groups(occurrence_count DESC);
`);

// Create settings table for retention and other configurations
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Insert default retention settings if they don't exist
const defaultSettings: Record<string, string> = {
  'retention.logs_days': '7',
  'retention.traces_days': '14',
  'retention.spans_days': '14',
  'retention.error_groups_days': '30',
  'cleanup.enabled': 'true',
  'cleanup.interval_hours': '1',
};

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
`);

for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

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
  INSERT INTO logs (id, timestamp, level, message, app_name, session_id, environment, metadata, stack_trace, context, error_group_id)
  VALUES (@id, @timestamp, @level, @message, @appName, @sessionId, @environment, @metadata, @stackTrace, @context, @errorGroupId)
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
    errorGroupId: row.error_group_id as string | undefined,
  };
}

/**
 * Generate a fingerprint for grouping similar errors
 * Uses message (normalized) + first stack frame + app name
 */
function generateErrorFingerprint(message: string, stackTrace: string | undefined, appName: string): string {
  // Normalize message by removing variable parts (numbers, UUIDs, etc.)
  const normalizedMessage = message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
    .replace(/\b\d+\b/g, '<NUM>')
    .replace(/0x[0-9a-f]+/gi, '<HEX>')
    .replace(/'[^']*'/g, "'<STR>'")
    .replace(/"[^"]*"/g, '"<STR>"')
    .trim();
  
  // Extract first meaningful stack frame (skip generic frames)
  let stackFrame = '';
  if (stackTrace) {
    const lines = stackTrace.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('at ') && !trimmed.includes('node_modules')) {
        stackFrame = trimmed.replace(/:\d+:\d+/, ':<LINE>:<COL>');
        break;
      }
    }
  }
  
  // Create fingerprint from combined data
  const fingerprintData = `${appName}|${normalizedMessage}|${stackFrame}`;
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprintData.length; i++) {
    const char = fingerprintData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Create or update an error group and return its ID
 */
function upsertErrorGroup(log: LogEntry): string {
  const fingerprint = generateErrorFingerprint(log.message, log.stackTrace, log.appName);
  
  // Check if group exists
  const existingGroup = db.prepare(`
    SELECT id, occurrence_count FROM error_groups WHERE fingerprint = ?
  `).get(fingerprint) as { id: string; occurrence_count: number } | undefined;
  
  if (existingGroup) {
    // Update existing group
    db.prepare(`
      UPDATE error_groups 
      SET last_seen = ?, occurrence_count = occurrence_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(log.timestamp, existingGroup.id);
    
    return existingGroup.id;
  } else {
    // Create new group
    const groupId = crypto.randomUUID();
    const stackTracePreview = log.stackTrace 
      ? log.stackTrace.split('\n').slice(0, 3).join('\n') 
      : null;
    
    db.prepare(`
      INSERT INTO error_groups (id, fingerprint, message, app_name, first_seen, last_seen, stack_trace_preview)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(groupId, fingerprint, log.message, log.appName, log.timestamp, log.timestamp, stackTracePreview);
    
    return groupId;
  }
}

export function insertLogEntry(log: LogEntry): { errorGroupId?: string } {
  let errorGroupId: string | undefined;
  
  // For error logs, create/update error group
  if (log.level === 'error') {
    errorGroupId = upsertErrorGroup(log);
  }
  
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
    errorGroupId: errorGroupId || null,
  });
  
  return { errorGroupId };
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

// ==================== Error Groups ====================

export type ErrorGroupStatus = 'unreviewed' | 'reviewed' | 'ignored' | 'resolved';

export interface ErrorGroup {
  id: string;
  fingerprint: string;
  message: string;
  appName: string;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  status: ErrorGroupStatus;
  stackTracePreview?: string;
}

export interface ErrorGroupsQueryParams {
  appName?: string;
  status?: ErrorGroupStatus;
  search?: string;
  sortBy?: 'last_seen' | 'first_seen' | 'occurrence_count';
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface PaginatedErrorGroups {
  errorGroups: ErrorGroup[];
  total: number;
  limit: number;
  offset: number;
}

export interface ErrorGroupStats {
  totalGroups: number;
  totalOccurrences: number;
  byStatus: Record<ErrorGroupStatus, number>;
  byApp: Record<string, number>;
  recentTrend: { date: string; count: number }[];
}

function parseErrorGroupRow(row: Record<string, unknown>): ErrorGroup {
  return {
    id: row.id as string,
    fingerprint: row.fingerprint as string,
    message: row.message as string,
    appName: row.app_name as string,
    firstSeen: row.first_seen as string,
    lastSeen: row.last_seen as string,
    occurrenceCount: row.occurrence_count as number,
    status: row.status as ErrorGroupStatus,
    stackTracePreview: row.stack_trace_preview as string | undefined,
  };
}

export function getErrorGroups(params: ErrorGroupsQueryParams): PaginatedErrorGroups {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.appName) {
    conditions.push('app_name = ?');
    values.push(params.appName);
  }

  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }

  if (params.search) {
    conditions.push('message LIKE ?');
    values.push(`%${params.search}%`);
  }

  let query = 'SELECT * FROM error_groups';
  let countQuery = 'SELECT COUNT(*) as total FROM error_groups';

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  // Sort
  const sortColumn = params.sortBy || 'last_seen';
  const sortOrder = params.sortOrder || 'desc';
  query += ` ORDER BY ${sortColumn} ${sortOrder}`;

  query += ' LIMIT ? OFFSET ?';

  const countStmt = db.prepare(countQuery);
  const queryStmt = db.prepare(query);

  const total = (countStmt.get(...values) as { total: number }).total;
  const rows = queryStmt.all(...values, params.limit, params.offset) as Record<string, unknown>[];
  const errorGroups = rows.map(parseErrorGroupRow);

  return {
    errorGroups,
    total,
    limit: params.limit,
    offset: params.offset,
  };
}

export function getErrorGroupById(id: string): ErrorGroup | null {
  const row = db.prepare('SELECT * FROM error_groups WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseErrorGroupRow(row) : null;
}

export function updateErrorGroupStatus(id: string, status: ErrorGroupStatus): boolean {
  const result = db.prepare(`
    UPDATE error_groups 
    SET status = ?, updated_at = datetime('now') 
    WHERE id = ?
  `).run(status, id);
  
  return result.changes > 0;
}

export function getErrorGroupOccurrences(groupId: string, limit = 50, offset = 0): PaginatedLogs {
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM logs WHERE error_group_id = ?');
  const queryStmt = db.prepare(`
    SELECT * FROM logs 
    WHERE error_group_id = ? 
    ORDER BY timestamp DESC 
    LIMIT ? OFFSET ?
  `);

  const total = (countStmt.get(groupId) as { total: number }).total;
  const rows = queryStmt.all(groupId, limit, offset) as Record<string, unknown>[];
  const logs = rows.map(parseLogRow);

  return {
    logs,
    total,
    limit,
    offset,
  };
}

export function getErrorGroupStats(): ErrorGroupStats {
  // Total groups
  const totalGroups = (db.prepare('SELECT COUNT(*) as count FROM error_groups').get() as { count: number }).count;
  
  // Total occurrences
  const totalOccurrences = (db.prepare('SELECT SUM(occurrence_count) as sum FROM error_groups').get() as { sum: number | null }).sum || 0;
  
  // By status
  const byStatusRows = db.prepare(`
    SELECT status, COUNT(*) as count FROM error_groups GROUP BY status
  `).all() as { status: ErrorGroupStatus; count: number }[];
  const byStatus = {
    unreviewed: 0,
    reviewed: 0,
    ignored: 0,
    resolved: 0,
    ...Object.fromEntries(byStatusRows.map(r => [r.status, r.count])),
  };
  
  // By app
  const byAppRows = db.prepare(`
    SELECT app_name, COUNT(*) as count FROM error_groups GROUP BY app_name
  `).all() as { app_name: string; count: number }[];
  const byApp = Object.fromEntries(byAppRows.map(r => [r.app_name, r.count]));
  
  // Recent trend (last 7 days)
  const recentTrendRows = db.prepare(`
    SELECT DATE(last_seen) as date, SUM(occurrence_count) as count
    FROM error_groups
    WHERE last_seen >= datetime('now', '-7 days')
    GROUP BY DATE(last_seen)
    ORDER BY date ASC
  `).all() as { date: string; count: number }[];
  
  return {
    totalGroups,
    totalOccurrences,
    byStatus,
    byApp,
    recentTrend: recentTrendRows,
  };
}

export function getIgnoredErrorGroupIds(): string[] {
  const rows = db.prepare(`
    SELECT id FROM error_groups WHERE status = 'ignored'
  `).all() as { id: string }[];
  return rows.map(r => r.id);
}

export function getLogsWithIgnoredInfo(params: LogsQueryParams & { excludeIgnored?: boolean }): PaginatedLogs & { ignoredCount: number } {
  const baseResult = getLogs(params);
  
  // Get ignored error group IDs
  const ignoredIds = getIgnoredErrorGroupIds();
  
  if (params.excludeIgnored && ignoredIds.length > 0) {
    // Filter out ignored errors
    const filteredLogs = baseResult.logs.filter(log => 
      !log.errorGroupId || !ignoredIds.includes(log.errorGroupId)
    );
    
    const ignoredCount = baseResult.logs.length - filteredLogs.length;
    
    return {
      ...baseResult,
      logs: filteredLogs,
      ignoredCount,
    };
  }
  
  return {
    ...baseResult,
    ignoredCount: 0,
  };
}

// ==================== Traces ====================

export type TraceStatus = 'running' | 'completed' | 'error';

export interface Trace {
  id: string;
  name: string;
  appName: string;
  sessionId: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: TraceStatus;
  spanCount: number;
  errorCount: number;
  metadata?: Record<string, unknown>;
}

export interface Span {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  operationType: string | null;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: TraceStatus;
  metadata?: Record<string, unknown>;
}

export interface TracesQueryParams {
  appName?: string;
  sessionId?: string;
  status?: TraceStatus;
  name?: string;
  minDuration?: number;
  maxDuration?: number;
  startDate?: string;
  endDate?: string;
  limit: number;
  offset: number;
}

export interface PaginatedTraces {
  traces: Trace[];
  total: number;
  limit: number;
  offset: number;
}

export interface TraceStats {
  totalTraces: number;
  avgDurationMs: number;
  byStatus: Record<TraceStatus, number>;
  byApp: Record<string, number>;
  recentTrend: { date: string; count: number; avgDuration: number }[];
}

function parseTraceRow(row: Record<string, unknown>): Trace {
  return {
    id: row.id as string,
    name: row.name as string,
    appName: row.app_name as string,
    sessionId: row.session_id as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string | null,
    durationMs: row.duration_ms as number | null,
    status: row.status as TraceStatus,
    spanCount: row.span_count as number,
    errorCount: row.error_count as number,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  };
}

function parseSpanRow(row: Record<string, unknown>): Span {
  return {
    id: row.id as string,
    traceId: row.trace_id as string,
    parentSpanId: row.parent_span_id as string | null,
    name: row.name as string,
    operationType: row.operation_type as string | null,
    startTime: row.start_time as string,
    endTime: row.end_time as string | null,
    durationMs: row.duration_ms as number | null,
    status: row.status as TraceStatus,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  };
}

export function getTraces(params: TracesQueryParams): PaginatedTraces {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.appName) {
    conditions.push('app_name = ?');
    values.push(params.appName);
  }

  if (params.sessionId) {
    conditions.push('session_id = ?');
    values.push(params.sessionId);
  }

  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }

  if (params.name) {
    conditions.push('name LIKE ?');
    values.push(`%${params.name}%`);
  }

  if (params.minDuration !== undefined) {
    conditions.push('duration_ms >= ?');
    values.push(params.minDuration);
  }

  if (params.maxDuration !== undefined) {
    conditions.push('duration_ms <= ?');
    values.push(params.maxDuration);
  }

  if (params.startDate) {
    conditions.push('start_time >= ?');
    values.push(params.startDate);
  }

  if (params.endDate) {
    conditions.push('start_time <= ?');
    values.push(params.endDate);
  }

  let query = 'SELECT * FROM traces';
  let countQuery = 'SELECT COUNT(*) as total FROM traces';

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';

  const countStmt = db.prepare(countQuery);
  const queryStmt = db.prepare(query);

  const total = (countStmt.get(...values) as { total: number }).total;
  const rows = queryStmt.all(...values, params.limit, params.offset) as Record<string, unknown>[];
  const traces = rows.map(parseTraceRow);

  return {
    traces,
    total,
    limit: params.limit,
    offset: params.offset,
  };
}

export function getTraceById(id: string): Trace | null {
  const row = db.prepare('SELECT * FROM traces WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseTraceRow(row) : null;
}

export function getSpansByTraceId(traceId: string): Span[] {
  const rows = db.prepare(`
    SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time ASC
  `).all(traceId) as Record<string, unknown>[];
  return rows.map(parseSpanRow);
}

export function getSpanById(id: string): Span | null {
  const row = db.prepare('SELECT * FROM spans WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseSpanRow(row) : null;
}

export function createTrace(trace: Omit<Trace, 'spanCount' | 'errorCount'>): Trace {
  const stmt = db.prepare(`
    INSERT INTO traces (id, name, app_name, session_id, start_time, end_time, duration_ms, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    trace.id,
    trace.name,
    trace.appName,
    trace.sessionId,
    trace.startTime,
    trace.endTime,
    trace.durationMs,
    trace.status,
    trace.metadata ? JSON.stringify(trace.metadata) : null
  );

  return {
    ...trace,
    spanCount: 0,
    errorCount: 0,
  };
}

export function updateTrace(id: string, updates: Partial<Pick<Trace, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.endTime !== undefined) {
    sets.push('end_time = ?');
    values.push(updates.endTime);
  }

  if (updates.durationMs !== undefined) {
    sets.push('duration_ms = ?');
    values.push(updates.durationMs);
  }

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }

  if (updates.metadata !== undefined) {
    sets.push('metadata = ?');
    values.push(JSON.stringify(updates.metadata));
  }

  if (sets.length === 0) return false;

  values.push(id);
  const result = db.prepare(`UPDATE traces SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function createSpan(span: Span): Span {
  const stmt = db.prepare(`
    INSERT INTO spans (id, trace_id, parent_span_id, name, operation_type, start_time, end_time, duration_ms, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    span.id,
    span.traceId,
    span.parentSpanId,
    span.name,
    span.operationType,
    span.startTime,
    span.endTime,
    span.durationMs,
    span.status,
    span.metadata ? JSON.stringify(span.metadata) : null
  );

  // Update trace span count
  db.prepare(`
    UPDATE traces SET span_count = span_count + 1 WHERE id = ?
  `).run(span.traceId);

  return span;
}

export function updateSpan(id: string, updates: Partial<Pick<Span, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.endTime !== undefined) {
    sets.push('end_time = ?');
    values.push(updates.endTime);
  }

  if (updates.durationMs !== undefined) {
    sets.push('duration_ms = ?');
    values.push(updates.durationMs);
  }

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }

  if (updates.metadata !== undefined) {
    sets.push('metadata = ?');
    values.push(JSON.stringify(updates.metadata));
  }

  if (sets.length === 0) return false;

  values.push(id);
  const span = getSpanById(id);
  const result = db.prepare(`UPDATE spans SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  // Update trace error count if span status changed to error
  if (result.changes > 0 && span && updates.status === 'error') {
    db.prepare(`
      UPDATE traces SET error_count = error_count + 1 WHERE id = ?
    `).run(span.traceId);
  }

  return result.changes > 0;
}

export function getTraceStats(): TraceStats {
  // Total traces
  const totalTraces = (db.prepare('SELECT COUNT(*) as count FROM traces').get() as { count: number }).count;

  // Average duration
  const avgResult = db.prepare(`
    SELECT AVG(duration_ms) as avg FROM traces WHERE duration_ms IS NOT NULL
  `).get() as { avg: number | null };
  const avgDurationMs = avgResult.avg || 0;

  // By status
  const byStatusRows = db.prepare(`
    SELECT status, COUNT(*) as count FROM traces GROUP BY status
  `).all() as { status: TraceStatus; count: number }[];
  const byStatus: Record<TraceStatus, number> = {
    running: 0,
    completed: 0,
    error: 0,
    ...Object.fromEntries(byStatusRows.map(r => [r.status, r.count])),
  };

  // By app
  const byAppRows = db.prepare(`
    SELECT app_name, COUNT(*) as count FROM traces GROUP BY app_name
  `).all() as { app_name: string; count: number }[];
  const byApp = Object.fromEntries(byAppRows.map(r => [r.app_name, r.count]));

  // Recent trend (last 7 days)
  const recentTrendRows = db.prepare(`
    SELECT 
      DATE(start_time) as date, 
      COUNT(*) as count,
      AVG(duration_ms) as avgDuration
    FROM traces
    WHERE start_time >= datetime('now', '-7 days')
    GROUP BY DATE(start_time)
    ORDER BY date ASC
  `).all() as { date: string; count: number; avgDuration: number | null }[];

  return {
    totalTraces,
    avgDurationMs,
    byStatus,
    byApp,
    recentTrend: recentTrendRows.map(r => ({
      date: r.date,
      count: r.count,
      avgDuration: r.avgDuration || 0,
    })),
  };
}

export function getLogsByTraceId(traceId: string, limit = 100): LogEntry[] {
  const rows = db.prepare(`
    SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC LIMIT ?
  `).all(traceId, limit) as Record<string, unknown>[];
  return rows.map(parseLogRow);
}

export function getTraceWithDetails(id: string): { trace: Trace; spans: Span[]; logs: LogEntry[] } | null {
  const trace = getTraceById(id);
  if (!trace) return null;

  const spans = getSpansByTraceId(id);
  const logs = getLogsByTraceId(id);

  return { trace, spans, logs };
}

// ============================================
// Settings Functions
// ============================================

export interface RetentionSettings {
  logsRetentionDays: number;
  tracesRetentionDays: number;
  spansRetentionDays: number;
  errorGroupsRetentionDays: number;
  cleanupEnabled: boolean;
  cleanupIntervalHours: number;
}

export interface StorageStats {
  totalLogs: number;
  totalTraces: number;
  totalSpans: number;
  totalErrorGroups: number;
  databaseSizeBytes: number;
  oldestLog: string | null;
  oldestTrace: string | null;
}

export interface CleanupResult {
  logsDeleted: number;
  tracesDeleted: number;
  spansDeleted: number;
  errorGroupsDeleted: number;
  durationMs: number;
}

export function getSettings(): RetentionSettings {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[];
  const settingsMap = Object.fromEntries(rows.map(r => [r.key, r.value]));

  return {
    logsRetentionDays: parseInt(settingsMap['retention.logs_days'] || '7', 10),
    tracesRetentionDays: parseInt(settingsMap['retention.traces_days'] || '14', 10),
    spansRetentionDays: parseInt(settingsMap['retention.spans_days'] || '14', 10),
    errorGroupsRetentionDays: parseInt(settingsMap['retention.error_groups_days'] || '30', 10),
    cleanupEnabled: settingsMap['cleanup.enabled'] === 'true',
    cleanupIntervalHours: parseInt(settingsMap['cleanup.interval_hours'] || '1', 10),
  };
}

export function updateSettings(updates: Partial<RetentionSettings>): RetentionSettings {
  const updateStmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) 
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);

  if (updates.logsRetentionDays !== undefined) {
    updateStmt.run('retention.logs_days', updates.logsRetentionDays.toString());
  }
  if (updates.tracesRetentionDays !== undefined) {
    updateStmt.run('retention.traces_days', updates.tracesRetentionDays.toString());
  }
  if (updates.spansRetentionDays !== undefined) {
    updateStmt.run('retention.spans_days', updates.spansRetentionDays.toString());
  }
  if (updates.errorGroupsRetentionDays !== undefined) {
    updateStmt.run('retention.error_groups_days', updates.errorGroupsRetentionDays.toString());
  }
  if (updates.cleanupEnabled !== undefined) {
    updateStmt.run('cleanup.enabled', updates.cleanupEnabled.toString());
  }
  if (updates.cleanupIntervalHours !== undefined) {
    updateStmt.run('cleanup.interval_hours', updates.cleanupIntervalHours.toString());
  }

  return getSettings();
}

export function getStorageStats(): StorageStats {
  const totalLogs = (db.prepare('SELECT COUNT(*) as count FROM logs').get() as { count: number }).count;
  const totalTraces = (db.prepare('SELECT COUNT(*) as count FROM traces').get() as { count: number }).count;
  const totalSpans = (db.prepare('SELECT COUNT(*) as count FROM spans').get() as { count: number }).count;
  const totalErrorGroups = (db.prepare('SELECT COUNT(*) as count FROM error_groups').get() as { count: number }).count;

  // Get database file size
  const pageCount = (db.pragma('page_count') as { page_count: number }[])[0]?.page_count || 0;
  const pageSize = (db.pragma('page_size') as { page_size: number }[])[0]?.page_size || 4096;
  const databaseSizeBytes = pageCount * pageSize;

  // Get oldest records
  const oldestLogRow = db.prepare('SELECT MIN(timestamp) as oldest FROM logs').get() as { oldest: string | null };
  const oldestTraceRow = db.prepare('SELECT MIN(start_time) as oldest FROM traces').get() as { oldest: string | null };

  return {
    totalLogs,
    totalTraces,
    totalSpans,
    totalErrorGroups,
    databaseSizeBytes,
    oldestLog: oldestLogRow.oldest,
    oldestTrace: oldestTraceRow.oldest,
  };
}

// ============================================
// Cleanup Functions
// ============================================

export function cleanupOldLogs(retentionDays: number): number {
  if (retentionDays <= 0) return 0;

  const result = db.prepare(`
    DELETE FROM logs WHERE timestamp < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  return result.changes;
}

export function cleanupOldTraces(retentionDays: number): number {
  if (retentionDays <= 0) return 0;

  const result = db.prepare(`
    DELETE FROM traces WHERE start_time < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  return result.changes;
}

export function cleanupOldSpans(retentionDays: number): number {
  if (retentionDays <= 0) return 0;

  const result = db.prepare(`
    DELETE FROM spans WHERE start_time < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  return result.changes;
}

export function cleanupOldErrorGroups(retentionDays: number): number {
  if (retentionDays <= 0) return 0;

  const result = db.prepare(`
    DELETE FROM error_groups WHERE last_seen < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  return result.changes;
}

export function cleanupOrphanedSpans(): number {
  // Remove spans that belong to deleted traces
  const result = db.prepare(`
    DELETE FROM spans WHERE trace_id NOT IN (SELECT id FROM traces)
  `).run();

  return result.changes;
}

export function runCleanup(): CleanupResult {
  const startTime = Date.now();
  const settings = getSettings();

  const logsDeleted = cleanupOldLogs(settings.logsRetentionDays);
  const tracesDeleted = cleanupOldTraces(settings.tracesRetentionDays);
  const spansDeleted = cleanupOldSpans(settings.spansRetentionDays) + cleanupOrphanedSpans();
  const errorGroupsDeleted = cleanupOldErrorGroups(settings.errorGroupsRetentionDays);

  const durationMs = Date.now() - startTime;

  // Vacuum to reclaim disk space (do this periodically, not every cleanup)
  // Only vacuum if significant data was deleted
  if (logsDeleted + tracesDeleted + spansDeleted + errorGroupsDeleted > 100) {
    try {
      db.exec('VACUUM');
    } catch {
      // VACUUM may fail if there are active transactions, that's ok
    }
  }

  return {
    logsDeleted,
    tracesDeleted,
    spansDeleted,
    errorGroupsDeleted,
    durationMs,
  };
}

// ============================================
// Cleanup Job (Automatic)
// ============================================

let cleanupIntervalId: NodeJS.Timeout | null = null;

export function startCleanupJob(): void {
  const settings = getSettings();
  
  if (!settings.cleanupEnabled) {
    console.log('[Cleanup] Automatic cleanup is disabled');
    return;
  }

  const intervalMs = settings.cleanupIntervalHours * 60 * 60 * 1000;
  
  // Run immediately on start
  console.log('[Cleanup] Running initial cleanup...');
  const result = runCleanup();
  console.log(`[Cleanup] Initial cleanup completed in ${result.durationMs}ms:`, {
    logsDeleted: result.logsDeleted,
    tracesDeleted: result.tracesDeleted,
    spansDeleted: result.spansDeleted,
    errorGroupsDeleted: result.errorGroupsDeleted,
  });

  // Schedule periodic cleanup
  cleanupIntervalId = setInterval(() => {
    const currentSettings = getSettings();
    if (!currentSettings.cleanupEnabled) {
      console.log('[Cleanup] Cleanup skipped (disabled)');
      return;
    }

    console.log('[Cleanup] Running scheduled cleanup...');
    const result = runCleanup();
    console.log(`[Cleanup] Scheduled cleanup completed in ${result.durationMs}ms:`, {
      logsDeleted: result.logsDeleted,
      tracesDeleted: result.tracesDeleted,
      spansDeleted: result.spansDeleted,
      errorGroupsDeleted: result.errorGroupsDeleted,
    });
  }, intervalMs);

  console.log(`[Cleanup] Cleanup job started, running every ${settings.cleanupIntervalHours} hour(s)`);
}

export function stopCleanupJob(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log('[Cleanup] Cleanup job stopped');
  }
}

export function restartCleanupJob(): void {
  stopCleanupJob();
  startCleanupJob();
}

export { db };
