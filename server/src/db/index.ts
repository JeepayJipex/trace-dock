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

export { db };
