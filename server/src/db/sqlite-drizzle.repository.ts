import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { DrizzleRepository } from './drizzle.repository';
import { sqliteSchema } from './schema';
import { DEFAULT_SETTINGS } from './config';
import type { LogsQueryParams, PaginatedLogs, StorageStats, CleanupResult } from './repository.interface';
import type { LogEntry } from '../schemas';

/**
 * SQLite repository using Drizzle ORM.
 * 
 * Uses Drizzle for all CRUD operations, with raw SQL only for SQLite-specific features:
 * - FTS5 virtual tables (full-text search)
 * - Triggers for FTS sync
 * - VACUUM optimization
 */
export class SQLiteRepository extends DrizzleRepository {
  private sqlite: ReturnType<typeof Database>;

  constructor(dbPath: string, debug = false) {
    // Ensure data directory exists
    const dir = dirname(dbPath);
    if (dir && dir !== '.' && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const sqlite = new Database(dbPath);
    
    // SQLite optimizations
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('synchronous = NORMAL');

    const db: BetterSQLite3Database = drizzle(sqlite, { logger: debug });

    super({
      db,
      schema: sqliteSchema,
      dbType: 'sqlite',
      debug,
      rawConnection: sqlite,
    });

    this.sqlite = sqlite;
    
    // Initialize database schema
    this.initializeSchema();
  }

  /**
   * Initialize the database schema using Drizzle-generated SQL.
   * Also sets up FTS5 for full-text search (SQLite-specific feature).
   */
  private initializeSchema(): void {
    // Create tables using Drizzle's schema definitions
    this.createTablesFromDrizzleSchema();
    
    // Initialize default settings
    this.initializeDefaultSettings();
    
    // Setup FTS5 for full-text search (SQLite-specific)
    this.setupFullTextSearch();
  }

  /**
   * Create tables from Drizzle schema definitions.
   * This generates the same SQL that drizzle-kit would generate.
   */
  private createTablesFromDrizzleSchema(): void {
    // Use Drizzle's sql helper to create tables if they don't exist
    // This matches the schema definitions in schema/logs.ts, etc.
    
    this.db.run(sql`
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
      )
    `);

    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_app_name ON logs(app_name)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_error_group_id ON logs(error_group_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_span_id ON logs(span_id)`);

    this.db.run(sql`
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
      )
    `);

    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_traces_app_name ON traces(app_name)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_traces_session_id ON traces(session_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_traces_start_time ON traces(start_time DESC)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status)`);

    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS spans (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL REFERENCES traces(id),
        parent_span_id TEXT,
        name TEXT NOT NULL,
        operation_type TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms INTEGER,
        status TEXT DEFAULT 'running',
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_spans_parent_span_id ON spans(parent_span_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time)`);

    this.db.run(sql`
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
      )
    `);

    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_error_groups_fingerprint ON error_groups(fingerprint)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_error_groups_status ON error_groups(status)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_error_groups_app_name ON error_groups(app_name)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_error_groups_last_seen ON error_groups(last_seen DESC)`);

    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  /**
   * Initialize default settings using Drizzle insert.
   */
  private initializeDefaultSettings(): void {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      this.db.run(sql`INSERT OR IGNORE INTO settings (key, value) VALUES (${key}, ${value})`);
    }
  }

  /**
   * Setup FTS5 (Full-Text Search) for the logs table.
   * FTS5 is a SQLite-specific feature not supported by Drizzle schema.
   */
  private setupFullTextSearch(): void {
    // Check if FTS table exists
    const ftsExists = this.sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='logs_fts'`
    ).get();

    if (!ftsExists) {
      // Create FTS5 virtual table (SQLite-specific, not supported by Drizzle)
      this.sqlite.exec(`
        CREATE VIRTUAL TABLE logs_fts USING fts5(
          id,
          message,
          app_name,
          metadata,
          stack_trace,
          content='logs',
          content_rowid='rowid'
        );

        -- Triggers to keep FTS in sync with logs table
        CREATE TRIGGER IF NOT EXISTS logs_fts_insert AFTER INSERT ON logs BEGIN
          INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
          VALUES (NEW.rowid, NEW.id, NEW.message, NEW.app_name, COALESCE(NEW.metadata, ''), COALESCE(NEW.stack_trace, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS logs_fts_delete AFTER DELETE ON logs BEGIN
          INSERT INTO logs_fts(logs_fts, rowid, id, message, app_name, metadata, stack_trace)
          VALUES ('delete', OLD.rowid, OLD.id, OLD.message, OLD.app_name, COALESCE(OLD.metadata, ''), COALESCE(OLD.stack_trace, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS logs_fts_update AFTER UPDATE ON logs BEGIN
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
  }

  /**
   * Override getLogs to use SQLite FTS5 for better full-text search performance.
   */
  override getLogs(params: LogsQueryParams): PaginatedLogs {
    let freeTextSearch = '';
    if (params.search) {
      const { filters, freeText } = this.parseSearchQuery(params.search);
      freeTextSearch = freeText;

      if (filters.level && !params.level) params.level = filters.level;
      if (filters.app && !params.appName) params.appName = filters.app;
      if (filters.session && !params.sessionId) params.sessionId = filters.session;
    }

    // Use FTS only for free text search
    if (freeTextSearch) {
      return this.getLogsWithFTS(params, freeTextSearch);
    }

    // Fall back to parent implementation for structured queries
    return super.getLogs(params);
  }

  /**
   * Get logs using FTS5 full-text search.
   */
  private getLogsWithFTS(params: LogsQueryParams, freeTextSearch: string): PaginatedLogs {
    const whereParts: string[] = [];
    const whereParams: unknown[] = [];

    if (params.level) {
      whereParts.push('logs.level = ?');
      whereParams.push(params.level);
    }
    if (params.appName) {
      whereParts.push('logs.app_name = ?');
      whereParams.push(params.appName);
    }
    if (params.sessionId) {
      whereParts.push('logs.session_id = ?');
      whereParams.push(params.sessionId);
    }
    if (params.traceId) {
      whereParts.push('logs.trace_id = ?');
      whereParams.push(params.traceId);
    }

    const escapedSearch = freeTextSearch
      .replace(/['"]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(' ');

    if (!escapedSearch) {
      return super.getLogs(params);
    }

    const whereClause = whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : '';

    const countResult = this.sqlite
      .prepare(`
        SELECT COUNT(*) as total FROM logs
        INNER JOIN logs_fts ON logs.id = logs_fts.id
        WHERE logs_fts MATCH ?
        ${whereClause}
      `)
      .get(escapedSearch, ...whereParams) as { total: number };

    const rows = this.sqlite
      .prepare(`
        SELECT logs.* FROM logs
        INNER JOIN logs_fts ON logs.id = logs_fts.id
        WHERE logs_fts MATCH ?
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `)
      .all(escapedSearch, ...whereParams, params.limit, params.offset) as Record<string, unknown>[];

    return {
      logs: rows.map((r) => this.parseLogRow(r)),
      total: countResult.total,
      limit: params.limit,
      offset: params.offset,
    };
  }

  /**
   * Parse SQLite row to LogEntry - override to handle SQLite-specific column naming.
   */
  protected override parseLogRow(row: Record<string, unknown>): LogEntry {
    return {
      id: row.id as string,
      timestamp: String(row.timestamp),
      level: row.level as LogEntry['level'],
      message: row.message as string,
      appName: (row.app_name ?? row.appName) as string,
      sessionId: (row.session_id ?? row.sessionId) as string,
      environment: typeof row.environment === 'string' ? JSON.parse(row.environment) : row.environment,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      stackTrace: ((row.stack_trace ?? row.stackTrace) as string) || undefined,
      context: row.context ? (typeof row.context === 'string' ? JSON.parse(row.context) : row.context) : undefined,
      errorGroupId: ((row.error_group_id ?? row.errorGroupId) as string) || undefined,
      traceId: ((row.trace_id ?? row.traceId) as string) || undefined,
      spanId: ((row.span_id ?? row.spanId) as string) || undefined,
      parentSpanId: ((row.parent_span_id ?? row.parentSpanId) as string) || undefined,
    };
  }

  /**
   * Override getStorageStats to include SQLite database file size.
   */
  override getStorageStats(): StorageStats {
    const stats = super.getStorageStats();

    // Get SQLite database size using pragma
    const pageCount = (this.sqlite.pragma('page_count') as { page_count: number }[])[0]?.page_count || 0;
    const pageSize = (this.sqlite.pragma('page_size') as { page_size: number }[])[0]?.page_size || 4096;
    const databaseSizeBytes = pageCount * pageSize;

    return {
      ...stats,
      databaseSizeBytes,
    };
  }

  /**
   * Override runCleanup to add VACUUM after cleanup.
   */
  override runCleanup(): CleanupResult {
    const result = super.runCleanup();

    // Run VACUUM if significant data was deleted
    const totalDeleted = result.logsDeleted + result.tracesDeleted + result.spansDeleted + result.errorGroupsDeleted;
    if (totalDeleted > 100) {
      try {
        this.sqlite.exec('VACUUM');
      } catch {
        // VACUUM may fail if there are active transactions
      }
    }

    return result;
  }

  /**
   * Close the database connection.
   */
  override close(): void {
    this.sqlite.close();
  }
}
