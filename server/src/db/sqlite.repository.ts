import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc, asc, like, and, sql, count, sum, avg, min } from 'drizzle-orm';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { LogEntry } from '../schemas';
import type {
  IRepository,
  ErrorGroup,
  ErrorGroupStatus,
  Trace,
  TraceStatus,
  Span,
  RetentionSettings,
  StorageStats,
  CleanupResult,
  LogsQueryParams,
  PaginatedLogs,
  ErrorGroupsQueryParams,
  PaginatedErrorGroups,
  TracesQueryParams,
  PaginatedTraces,
  ErrorGroupStats,
  TraceStats,
  LogStats,
} from './repository.interface';
import { DEFAULT_SETTINGS } from './config';
import {
  sqliteLogs,
  sqliteTraces,
  sqliteSpans,
  sqliteErrorGroups,
  sqliteSettings,
} from './schema';

/**
 * SQLite implementation of the repository interface using Drizzle ORM
 */
export class SQLiteRepository implements IRepository {
  private sqlite: ReturnType<typeof Database>;
  private db: BetterSQLite3Database;
  
  constructor(dbPath: string, debug = false) {
    // Ensure data directory exists
    const dir = dirname(dbPath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    
    this.db = drizzle(this.sqlite, { logger: debug });
    
    this.initializeSchema();
  }
  
  private initializeSchema(): void {
    // Create tables
    this.sqlite.exec(`
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
        error_group_id TEXT,
        trace_id TEXT,
        span_id TEXT,
        parent_span_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
      CREATE INDEX IF NOT EXISTS idx_logs_app_name ON logs(app_name);
      CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_logs_error_group_id ON logs(error_group_id);
      CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id);
      CREATE INDEX IF NOT EXISTS idx_logs_span_id ON logs(span_id);

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

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    
    // Insert default settings
    const insertSetting = this.sqlite.prepare(`
      INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
    `);
    
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(key, value);
    }
    
    // Create FTS table for full-text search
    this.sqlite.exec(`
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
    this.sqlite.exec(`
      INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
      SELECT rowid, id, message, app_name, COALESCE(metadata, ''), COALESCE(stack_trace, '')
      FROM logs;
    `);
  }
  
  // ==================== Helper Functions ====================
  
  private parseLogRow(row: typeof sqliteLogs.$inferSelect): LogEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      level: row.level as LogEntry['level'],
      message: row.message,
      appName: row.appName,
      sessionId: row.sessionId,
      environment: JSON.parse(row.environment),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      stackTrace: row.stackTrace || undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      errorGroupId: row.errorGroupId || undefined,
      traceId: row.traceId || undefined,
      spanId: row.spanId || undefined,
      parentSpanId: row.parentSpanId || undefined,
    };
  }
  
  private parseErrorGroupRow(row: typeof sqliteErrorGroups.$inferSelect): ErrorGroup {
    return {
      id: row.id,
      fingerprint: row.fingerprint,
      message: row.message,
      appName: row.appName,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      occurrenceCount: row.occurrenceCount ?? 1,
      status: (row.status ?? 'unreviewed') as ErrorGroupStatus,
      stackTracePreview: row.stackTracePreview || undefined,
    };
  }
  
  private parseTraceRow(row: typeof sqliteTraces.$inferSelect): Trace {
    return {
      id: row.id,
      name: row.name,
      appName: row.appName,
      sessionId: row.sessionId,
      startTime: row.startTime,
      endTime: row.endTime,
      durationMs: row.durationMs,
      status: (row.status ?? 'running') as TraceStatus,
      spanCount: row.spanCount ?? 0,
      errorCount: row.errorCount ?? 0,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
  
  private parseSpanRow(row: typeof sqliteSpans.$inferSelect): Span {
    return {
      id: row.id,
      traceId: row.traceId,
      parentSpanId: row.parentSpanId,
      name: row.name,
      operationType: row.operationType,
      startTime: row.startTime,
      endTime: row.endTime,
      durationMs: row.durationMs,
      status: (row.status ?? 'running') as TraceStatus,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
  
  private generateErrorFingerprint(message: string, stackTrace: string | undefined, appName: string): string {
    const normalizedMessage = message
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
      .replace(/\b\d+\b/g, '<NUM>')
      .replace(/0x[0-9a-f]+/gi, '<HEX>')
      .replace(/'[^']*'/g, "'<STR>'")
      .replace(/"[^"]*"/g, '"<STR>"')
      .trim();
    
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
    
    const fingerprintData = `${appName}|${normalizedMessage}|${stackFrame}`;
    
    let hash = 0;
    for (let i = 0; i < fingerprintData.length; i++) {
      const char = fingerprintData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(36);
  }
  
  private upsertErrorGroup(log: LogEntry): string {
    const fingerprint = this.generateErrorFingerprint(log.message, log.stackTrace, log.appName);
    
    const existingGroup = this.db
      .select({ id: sqliteErrorGroups.id, occurrenceCount: sqliteErrorGroups.occurrenceCount })
      .from(sqliteErrorGroups)
      .where(eq(sqliteErrorGroups.fingerprint, fingerprint))
      .get();
    
    if (existingGroup) {
      this.db
        .update(sqliteErrorGroups)
        .set({
          lastSeen: log.timestamp,
          occurrenceCount: sql`${sqliteErrorGroups.occurrenceCount} + 1`,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(sqliteErrorGroups.id, existingGroup.id))
        .run();
      
      return existingGroup.id;
    } else {
      const groupId = crypto.randomUUID();
      const stackTracePreview = log.stackTrace
        ? log.stackTrace.split('\n').slice(0, 3).join('\n')
        : null;
      
      this.db.insert(sqliteErrorGroups).values({
        id: groupId,
        fingerprint,
        message: log.message,
        appName: log.appName,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        stackTracePreview,
      }).run();
      
      return groupId;
    }
  }
  
  private parseSearchQuery(search: string): { filters: Record<string, string>; freeText: string } {
    const filters: Record<string, string> = {};
    const filterRegex = /(\w+):(?:"([^"]+)"|(\S+))/g;
    let match;
    let remaining = search;
    
    while ((match = filterRegex.exec(search)) !== null) {
      const key = match[1].toLowerCase();
      const value = match[2] || match[3];
      filters[key] = value;
      remaining = remaining.replace(match[0], '');
    }
    
    return { filters, freeText: remaining.trim() };
  }
  
  // ==================== Logs ====================
  
  insertLog(log: LogEntry): { errorGroupId?: string } {
    let errorGroupId: string | undefined;
    
    if (log.level === 'error') {
      errorGroupId = this.upsertErrorGroup(log);
    }
    
    this.db.insert(sqliteLogs).values({
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
      traceId: log.traceId || null,
      spanId: log.spanId || null,
      parentSpanId: log.parentSpanId || null,
    }).run();
    
    return { errorGroupId };
  }
  
  getLogs(params: LogsQueryParams): PaginatedLogs {
    const conditions: ReturnType<typeof eq>[] = [];
    
    let freeTextSearch = '';
    if (params.search) {
      const { filters, freeText } = this.parseSearchQuery(params.search);
      freeTextSearch = freeText;
      
      if (filters.level && !params.level) params.level = filters.level;
      if (filters.app && !params.appName) params.appName = filters.app;
      if (filters.session && !params.sessionId) params.sessionId = filters.session;
    }
    
    if (params.level) {
      conditions.push(eq(sqliteLogs.level, params.level));
    }
    if (params.appName) {
      conditions.push(eq(sqliteLogs.appName, params.appName));
    }
    if (params.sessionId) {
      conditions.push(eq(sqliteLogs.sessionId, params.sessionId));
    }
    if (params.traceId) {
      conditions.push(eq(sqliteLogs.traceId, params.traceId));
    }
    
    // For FTS search, we need to use raw SQL
    if (freeTextSearch) {
      const escapedSearch = freeTextSearch
        .replace(/['"]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map(term => `"${term}"*`)
        .join(' ');
      
      if (escapedSearch) {
        const whereClause = conditions.length > 0 
          ? and(...conditions)
          : undefined;
        
        // Count with FTS
        const countResult = this.sqlite.prepare(`
          SELECT COUNT(*) as total FROM logs
          INNER JOIN logs_fts ON logs.id = logs_fts.id
          WHERE logs_fts MATCH ?
          ${whereClause ? 'AND ' + this.buildSqliteWhereClause(conditions) : ''}
        `).get(escapedSearch) as { total: number };
        
        // Query with FTS
        const rows = this.sqlite.prepare(`
          SELECT logs.* FROM logs
          INNER JOIN logs_fts ON logs.id = logs_fts.id
          WHERE logs_fts MATCH ?
          ${whereClause ? 'AND ' + this.buildSqliteWhereClause(conditions) : ''}
          ORDER BY timestamp DESC
          LIMIT ? OFFSET ?
        `).all(escapedSearch, params.limit, params.offset) as (typeof sqliteLogs.$inferSelect)[];
        
        return {
          logs: rows.map(r => this.parseLogRow(r)),
          total: countResult.total,
          limit: params.limit,
          offset: params.offset,
        };
      }
    }
    
    // Standard query without FTS
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const totalResult = this.db
      .select({ count: count() })
      .from(sqliteLogs)
      .where(whereClause)
      .get();
    
    const rows = this.db
      .select()
      .from(sqliteLogs)
      .where(whereClause)
      .orderBy(desc(sqliteLogs.timestamp))
      .limit(params.limit)
      .offset(params.offset)
      .all();
    
    return {
      logs: rows.map(r => this.parseLogRow(r)),
      total: totalResult?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }
  
  private buildSqliteWhereClause(conditions: ReturnType<typeof eq>[]): string {
    // This is a simplified version - in production you'd want proper SQL building
    return conditions.map(() => '1=1').join(' AND ');
  }
  
  getLogById(id: string): LogEntry | null {
    const row = this.db.select().from(sqliteLogs).where(eq(sqliteLogs.id, id)).get();
    return row ? this.parseLogRow(row) : null;
  }
  
  getRecentLogs(limit = 50): LogEntry[] {
    const rows = this.db
      .select()
      .from(sqliteLogs)
      .orderBy(desc(sqliteLogs.timestamp))
      .limit(limit)
      .all();
    return rows.map(r => this.parseLogRow(r));
  }
  
  getStats(): LogStats {
    const totalResult = this.db.select({ count: count() }).from(sqliteLogs).get();
    const total = totalResult?.count ?? 0;
    
    const byLevelRows = this.db
      .select({ level: sqliteLogs.level, count: count() })
      .from(sqliteLogs)
      .groupBy(sqliteLogs.level)
      .all();
    const byLevel = Object.fromEntries(byLevelRows.map(r => [r.level, r.count]));
    
    const byAppRows = this.db
      .select({ appName: sqliteLogs.appName, count: count() })
      .from(sqliteLogs)
      .groupBy(sqliteLogs.appName)
      .all();
    const byApp = Object.fromEntries(byAppRows.map(r => [r.appName, r.count]));
    
    return { total, byLevel, byApp };
  }
  
  getAppNames(): string[] {
    const rows = this.db
      .selectDistinct({ appName: sqliteLogs.appName })
      .from(sqliteLogs)
      .orderBy(sqliteLogs.appName)
      .all();
    return rows.map(r => r.appName);
  }
  
  getSessionIds(appName?: string): string[] {
    let query = this.db
      .selectDistinct({ sessionId: sqliteLogs.sessionId })
      .from(sqliteLogs);
    
    if (appName) {
      query = query.where(eq(sqliteLogs.appName, appName)) as typeof query;
    }
    
    const rows = query.orderBy(desc(sqliteLogs.sessionId)).limit(100).all();
    return rows.map(r => r.sessionId);
  }
  
  getMetadataKeys(): string[] {
    const rows = this.sqlite.prepare(`
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
  
  getSearchSuggestions(prefix: string): { type: string; value: string }[] {
    const suggestions: { type: string; value: string }[] = [];
    const lowerPrefix = prefix.toLowerCase();
    
    const apps = this.getAppNames();
    for (const app of apps) {
      if (app.toLowerCase().includes(lowerPrefix)) {
        suggestions.push({ type: 'app', value: `app:${app}` });
      }
    }
    
    const levels = ['debug', 'info', 'warn', 'error'];
    for (const level of levels) {
      if (level.includes(lowerPrefix)) {
        suggestions.push({ type: 'level', value: `level:${level}` });
      }
    }
    
    const metadataKeys = this.getMetadataKeys();
    for (const key of metadataKeys) {
      if (key.toLowerCase().includes(lowerPrefix)) {
        suggestions.push({ type: 'metadata', value: `${key}:` });
      }
    }
    
    return suggestions.slice(0, 10);
  }
  
  getLogsWithIgnoredInfo(params: LogsQueryParams & { excludeIgnored?: boolean }): PaginatedLogs & { ignoredCount: number } {
    const baseResult = this.getLogs(params);
    const ignoredIds = this.getIgnoredErrorGroupIds();
    
    if (params.excludeIgnored && ignoredIds.length > 0) {
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
    
    return { ...baseResult, ignoredCount: 0 };
  }
  
  getLogsByTraceId(traceId: string, limit = 100): LogEntry[] {
    const rows = this.db
      .select()
      .from(sqliteLogs)
      .where(eq(sqliteLogs.traceId, traceId))
      .orderBy(asc(sqliteLogs.timestamp))
      .limit(limit)
      .all();
    return rows.map(r => this.parseLogRow(r));
  }
  
  // ==================== Error Groups ====================
  
  getErrorGroups(params: ErrorGroupsQueryParams): PaginatedErrorGroups {
    const conditions: ReturnType<typeof eq>[] = [];
    
    if (params.appName) {
      conditions.push(eq(sqliteErrorGroups.appName, params.appName));
    }
    if (params.status) {
      conditions.push(eq(sqliteErrorGroups.status, params.status));
    }
    if (params.search) {
      conditions.push(like(sqliteErrorGroups.message, `%${params.search}%`));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const totalResult = this.db
      .select({ count: count() })
      .from(sqliteErrorGroups)
      .where(whereClause)
      .get();
    
    const sortColumn = params.sortBy === 'first_seen' 
      ? sqliteErrorGroups.firstSeen 
      : params.sortBy === 'occurrence_count'
        ? sqliteErrorGroups.occurrenceCount
        : sqliteErrorGroups.lastSeen;
    
    const orderFn = params.sortOrder === 'asc' ? asc : desc;
    
    const rows = this.db
      .select()
      .from(sqliteErrorGroups)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(params.limit)
      .offset(params.offset)
      .all();
    
    return {
      errorGroups: rows.map(r => this.parseErrorGroupRow(r)),
      total: totalResult?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }
  
  getErrorGroupById(id: string): ErrorGroup | null {
    const row = this.db.select().from(sqliteErrorGroups).where(eq(sqliteErrorGroups.id, id)).get();
    return row ? this.parseErrorGroupRow(row) : null;
  }
  
  updateErrorGroupStatus(id: string, status: ErrorGroupStatus): boolean {
    const result = this.db
      .update(sqliteErrorGroups)
      .set({ status, updatedAt: sql`datetime('now')` })
      .where(eq(sqliteErrorGroups.id, id))
      .run();
    return result.changes > 0;
  }
  
  getErrorGroupOccurrences(groupId: string, limit = 50, offset = 0): PaginatedLogs {
    const totalResult = this.db
      .select({ count: count() })
      .from(sqliteLogs)
      .where(eq(sqliteLogs.errorGroupId, groupId))
      .get();
    
    const rows = this.db
      .select()
      .from(sqliteLogs)
      .where(eq(sqliteLogs.errorGroupId, groupId))
      .orderBy(desc(sqliteLogs.timestamp))
      .limit(limit)
      .offset(offset)
      .all();
    
    return {
      logs: rows.map(r => this.parseLogRow(r)),
      total: totalResult?.count ?? 0,
      limit,
      offset,
    };
  }
  
  getErrorGroupStats(): ErrorGroupStats {
    const totalGroups = this.db
      .select({ count: count() })
      .from(sqliteErrorGroups)
      .get()?.count ?? 0;
    
    const totalOccurrencesResult = this.db
      .select({ sum: sum(sqliteErrorGroups.occurrenceCount) })
      .from(sqliteErrorGroups)
      .get();
    const totalOccurrences = Number(totalOccurrencesResult?.sum) || 0;
    
    const byStatusRows = this.db
      .select({ status: sqliteErrorGroups.status, count: count() })
      .from(sqliteErrorGroups)
      .groupBy(sqliteErrorGroups.status)
      .all();
    
    const byStatus: Record<ErrorGroupStatus, number> = {
      unreviewed: 0,
      reviewed: 0,
      ignored: 0,
      resolved: 0,
      ...Object.fromEntries(byStatusRows.map(r => [r.status, r.count])),
    };
    
    const byAppRows = this.db
      .select({ appName: sqliteErrorGroups.appName, count: count() })
      .from(sqliteErrorGroups)
      .groupBy(sqliteErrorGroups.appName)
      .all();
    const byApp = Object.fromEntries(byAppRows.map(r => [r.appName, r.count]));
    
    const recentTrendRows = this.sqlite.prepare(`
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
  
  getIgnoredErrorGroupIds(): string[] {
    const rows = this.db
      .select({ id: sqliteErrorGroups.id })
      .from(sqliteErrorGroups)
      .where(eq(sqliteErrorGroups.status, 'ignored'))
      .all();
    return rows.map(r => r.id);
  }
  
  // ==================== Traces ====================
  
  getTraces(params: TracesQueryParams): PaginatedTraces {
    const conditions: ReturnType<typeof eq>[] = [];
    
    if (params.appName) {
      conditions.push(eq(sqliteTraces.appName, params.appName));
    }
    if (params.sessionId) {
      conditions.push(eq(sqliteTraces.sessionId, params.sessionId));
    }
    if (params.status) {
      conditions.push(eq(sqliteTraces.status, params.status));
    }
    if (params.name) {
      conditions.push(like(sqliteTraces.name, `%${params.name}%`));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const totalResult = this.db
      .select({ count: count() })
      .from(sqliteTraces)
      .where(whereClause)
      .get();
    
    const rows = this.db
      .select()
      .from(sqliteTraces)
      .where(whereClause)
      .orderBy(desc(sqliteTraces.startTime))
      .limit(params.limit)
      .offset(params.offset)
      .all();
    
    return {
      traces: rows.map(r => this.parseTraceRow(r)),
      total: totalResult?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }
  
  getTraceById(id: string): Trace | null {
    const row = this.db.select().from(sqliteTraces).where(eq(sqliteTraces.id, id)).get();
    return row ? this.parseTraceRow(row) : null;
  }
  
  createTrace(trace: Omit<Trace, 'spanCount' | 'errorCount'>): Trace {
    this.db.insert(sqliteTraces).values({
      id: trace.id,
      name: trace.name,
      appName: trace.appName,
      sessionId: trace.sessionId,
      startTime: trace.startTime,
      endTime: trace.endTime,
      durationMs: trace.durationMs,
      status: trace.status,
      metadata: trace.metadata ? JSON.stringify(trace.metadata) : null,
    }).run();
    
    return { ...trace, spanCount: 0, errorCount: 0 };
  }
  
  updateTrace(id: string, updates: Partial<Pick<Trace, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean {
    const setValues: Record<string, unknown> = {};
    
    if (updates.endTime !== undefined) setValues.endTime = updates.endTime;
    if (updates.durationMs !== undefined) setValues.durationMs = updates.durationMs;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.metadata !== undefined) setValues.metadata = JSON.stringify(updates.metadata);
    
    if (Object.keys(setValues).length === 0) return false;
    
    const result = this.db
      .update(sqliteTraces)
      .set(setValues)
      .where(eq(sqliteTraces.id, id))
      .run();
    
    return result.changes > 0;
  }
  
  getTraceStats(): TraceStats {
    const totalTraces = this.db
      .select({ count: count() })
      .from(sqliteTraces)
      .get()?.count ?? 0;
    
    const avgResult = this.db
      .select({ avg: avg(sqliteTraces.durationMs) })
      .from(sqliteTraces)
      .get();
    const avgDurationMs = Number(avgResult?.avg) || 0;
    
    const byStatusRows = this.db
      .select({ status: sqliteTraces.status, count: count() })
      .from(sqliteTraces)
      .groupBy(sqliteTraces.status)
      .all();
    
    const byStatus: Record<TraceStatus, number> = {
      running: 0,
      completed: 0,
      error: 0,
      ...Object.fromEntries(byStatusRows.map(r => [r.status, r.count])),
    };
    
    const byAppRows = this.db
      .select({ appName: sqliteTraces.appName, count: count() })
      .from(sqliteTraces)
      .groupBy(sqliteTraces.appName)
      .all();
    const byApp = Object.fromEntries(byAppRows.map(r => [r.appName, r.count]));
    
    const recentTrendRows = this.sqlite.prepare(`
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
  
  getTraceWithDetails(id: string): { trace: Trace; spans: Span[]; logs: LogEntry[] } | null {
    const trace = this.getTraceById(id);
    if (!trace) return null;
    
    const spans = this.getSpansByTraceId(id);
    const logs = this.getLogsByTraceId(id);
    
    return { trace, spans, logs };
  }
  
  // ==================== Spans ====================
  
  getSpansByTraceId(traceId: string): Span[] {
    const rows = this.db
      .select()
      .from(sqliteSpans)
      .where(eq(sqliteSpans.traceId, traceId))
      .orderBy(asc(sqliteSpans.startTime))
      .all();
    return rows.map(r => this.parseSpanRow(r));
  }
  
  getSpanById(id: string): Span | null {
    const row = this.db.select().from(sqliteSpans).where(eq(sqliteSpans.id, id)).get();
    return row ? this.parseSpanRow(row) : null;
  }
  
  createSpan(span: Span): Span {
    this.db.insert(sqliteSpans).values({
      id: span.id,
      traceId: span.traceId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      operationType: span.operationType,
      startTime: span.startTime,
      endTime: span.endTime,
      durationMs: span.durationMs,
      status: span.status,
      metadata: span.metadata ? JSON.stringify(span.metadata) : null,
    }).run();
    
    // Update trace span count
    this.db
      .update(sqliteTraces)
      .set({ spanCount: sql`${sqliteTraces.spanCount} + 1` })
      .where(eq(sqliteTraces.id, span.traceId))
      .run();
    
    return span;
  }
  
  updateSpan(id: string, updates: Partial<Pick<Span, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean {
    const setValues: Record<string, unknown> = {};
    
    if (updates.endTime !== undefined) setValues.endTime = updates.endTime;
    if (updates.durationMs !== undefined) setValues.durationMs = updates.durationMs;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.metadata !== undefined) setValues.metadata = JSON.stringify(updates.metadata);
    
    if (Object.keys(setValues).length === 0) return false;
    
    const span = this.getSpanById(id);
    const result = this.db
      .update(sqliteSpans)
      .set(setValues)
      .where(eq(sqliteSpans.id, id))
      .run();
    
    // Update trace error count if span status changed to error
    if (result.changes > 0 && span && updates.status === 'error') {
      this.db
        .update(sqliteTraces)
        .set({ errorCount: sql`${sqliteTraces.errorCount} + 1` })
        .where(eq(sqliteTraces.id, span.traceId))
        .run();
    }
    
    return result.changes > 0;
  }
  
  // ==================== Settings ====================
  
  getSettings(): RetentionSettings {
    const rows = this.db.select().from(sqliteSettings).all();
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
  
  updateSettings(updates: Partial<RetentionSettings>): RetentionSettings {
    const upsert = (key: string, value: string) => {
      this.sqlite.prepare(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).run(key, value);
    };
    
    if (updates.logsRetentionDays !== undefined) {
      upsert('retention.logs_days', updates.logsRetentionDays.toString());
    }
    if (updates.tracesRetentionDays !== undefined) {
      upsert('retention.traces_days', updates.tracesRetentionDays.toString());
    }
    if (updates.spansRetentionDays !== undefined) {
      upsert('retention.spans_days', updates.spansRetentionDays.toString());
    }
    if (updates.errorGroupsRetentionDays !== undefined) {
      upsert('retention.error_groups_days', updates.errorGroupsRetentionDays.toString());
    }
    if (updates.cleanupEnabled !== undefined) {
      upsert('cleanup.enabled', updates.cleanupEnabled.toString());
    }
    if (updates.cleanupIntervalHours !== undefined) {
      upsert('cleanup.interval_hours', updates.cleanupIntervalHours.toString());
    }
    
    return this.getSettings();
  }
  
  getStorageStats(): StorageStats {
    const totalLogs = this.db.select({ count: count() }).from(sqliteLogs).get()?.count ?? 0;
    const totalTraces = this.db.select({ count: count() }).from(sqliteTraces).get()?.count ?? 0;
    const totalSpans = this.db.select({ count: count() }).from(sqliteSpans).get()?.count ?? 0;
    const totalErrorGroups = this.db.select({ count: count() }).from(sqliteErrorGroups).get()?.count ?? 0;
    
    const pageCount = (this.sqlite.pragma('page_count') as { page_count: number }[])[0]?.page_count || 0;
    const pageSize = (this.sqlite.pragma('page_size') as { page_size: number }[])[0]?.page_size || 4096;
    const databaseSizeBytes = pageCount * pageSize;
    
    const oldestLogRow = this.db.select({ oldest: min(sqliteLogs.timestamp) }).from(sqliteLogs).get();
    const oldestTraceRow = this.db.select({ oldest: min(sqliteTraces.startTime) }).from(sqliteTraces).get();
    
    return {
      totalLogs,
      totalTraces,
      totalSpans,
      totalErrorGroups,
      databaseSizeBytes,
      oldestLog: oldestLogRow?.oldest || null,
      oldestTrace: oldestTraceRow?.oldest || null,
    };
  }
  
  // ==================== Cleanup ====================
  
  cleanupOldLogs(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    
    const result = this.sqlite.prepare(`
      DELETE FROM logs WHERE timestamp < datetime('now', '-' || ? || ' days')
    `).run(retentionDays);
    
    return result.changes;
  }
  
  cleanupOldTraces(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    
    const result = this.sqlite.prepare(`
      DELETE FROM traces WHERE start_time < datetime('now', '-' || ? || ' days')
    `).run(retentionDays);
    
    return result.changes;
  }
  
  cleanupOldSpans(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    
    const result = this.sqlite.prepare(`
      DELETE FROM spans WHERE start_time < datetime('now', '-' || ? || ' days')
    `).run(retentionDays);
    
    return result.changes;
  }
  
  cleanupOldErrorGroups(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    
    const result = this.sqlite.prepare(`
      DELETE FROM error_groups WHERE last_seen < datetime('now', '-' || ? || ' days')
    `).run(retentionDays);
    
    return result.changes;
  }
  
  cleanupOrphanedSpans(): number {
    const result = this.sqlite.prepare(`
      DELETE FROM spans WHERE trace_id NOT IN (SELECT id FROM traces)
    `).run();
    
    return result.changes;
  }
  
  runCleanup(): CleanupResult {
    const startTime = Date.now();
    const settings = this.getSettings();
    
    const logsDeleted = this.cleanupOldLogs(settings.logsRetentionDays);
    const tracesDeleted = this.cleanupOldTraces(settings.tracesRetentionDays);
    const spansDeleted = this.cleanupOldSpans(settings.spansRetentionDays) + this.cleanupOrphanedSpans();
    const errorGroupsDeleted = this.cleanupOldErrorGroups(settings.errorGroupsRetentionDays);
    
    const durationMs = Date.now() - startTime;
    
    if (logsDeleted + tracesDeleted + spansDeleted + errorGroupsDeleted > 100) {
      try {
        this.sqlite.exec('VACUUM');
      } catch {
        // VACUUM may fail if there are active transactions
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
  
  // ==================== Lifecycle ====================
  
  close(): void {
    this.sqlite.close();
  }
}
