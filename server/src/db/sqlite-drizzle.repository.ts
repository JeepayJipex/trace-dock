import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DrizzleRepository } from './drizzle.repository';
import { sqliteSchema } from './schema';
import { DEFAULT_SETTINGS } from './config';
import type { LogsQueryParams, PaginatedLogs, StorageStats, CleanupResult } from './repository.interface';
import type { LogEntry } from '../schemas';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SQLiteRepositoryOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** 
   * Run Drizzle migrations automatically.
   * Set to true for tests or development.
   * In production, run `pnpm db:setup` before starting the server.
   */
  runMigrations?: boolean;
}

/**
 * SQLite repository using Drizzle ORM.
 * 
 * IMPORTANT: Run migrations before starting the server:
 *   pnpm db:setup
 * 
 * This repository handles:
 * - FTS5 virtual tables (not supported by Drizzle migrations)
 * - Default settings initialization
 * - SQLite-specific optimizations
 */
export class SQLiteRepository extends DrizzleRepository {
  private sqlite: ReturnType<typeof Database>;

  constructor(dbPath: string, options: SQLiteRepositoryOptions = {}) {
    const { debug = false, runMigrations: shouldRunMigrations = false } = options;
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
    
    // Run migrations if requested (for tests or development)
    if (shouldRunMigrations) {
      this.runMigrations();
    }
    
    // Setup FTS5 (not supported by Drizzle, must be done manually)
    this.setupFTS();
    
    // Initialize default settings
    this.initializeDefaultSettings();
    
    // Rebuild FTS index from existing data (for first-time setup or recovery)
    this.rebuildFTSIndex();
  }

  /**
   * Run Drizzle migrations to set up database schema.
   */
  private runMigrations(): void {
    const migrationsFolder = resolve(__dirname, '../../drizzle/sqlite');
    
    if (existsSync(migrationsFolder)) {
      migrate(this.db as BetterSQLite3Database, { migrationsFolder });
    }
  }

  /**
   * Setup FTS5 full-text search.
   * FTS5 is not supported by Drizzle ORM, so we create it manually.
   * This is idempotent - uses IF NOT EXISTS.
   */
  private setupFTS(): void {
    // Create FTS5 virtual table
    this.sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
        id,
        message,
        app_name,
        metadata,
        stack_trace,
        content='logs',
        content_rowid='rowid'
      );
    `);

    // Check if triggers already exist
    const triggerExists = this.sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND name='logs_fts_insert'`
    ).get();

    if (!triggerExists) {
      // Trigger to keep FTS in sync on INSERT
      this.sqlite.exec(`
        CREATE TRIGGER logs_fts_insert AFTER INSERT ON logs BEGIN
          INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
          VALUES (NEW.rowid, NEW.id, NEW.message, NEW.app_name, COALESCE(NEW.metadata, ''), COALESCE(NEW.stack_trace, ''));
        END;
      `);

      // Trigger to keep FTS in sync on DELETE
      this.sqlite.exec(`
        CREATE TRIGGER logs_fts_delete AFTER DELETE ON logs BEGIN
          INSERT INTO logs_fts(logs_fts, rowid, id, message, app_name, metadata, stack_trace)
          VALUES ('delete', OLD.rowid, OLD.id, OLD.message, OLD.app_name, COALESCE(OLD.metadata, ''), COALESCE(OLD.stack_trace, ''));
        END;
      `);

      // Trigger to keep FTS in sync on UPDATE
      this.sqlite.exec(`
        CREATE TRIGGER logs_fts_update AFTER UPDATE ON logs BEGIN
          INSERT INTO logs_fts(logs_fts, rowid, id, message, app_name, metadata, stack_trace)
          VALUES ('delete', OLD.rowid, OLD.id, OLD.message, OLD.app_name, COALESCE(OLD.metadata, ''), COALESCE(OLD.stack_trace, ''));
          INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
          VALUES (NEW.rowid, NEW.id, NEW.message, NEW.app_name, COALESCE(NEW.metadata, ''), COALESCE(NEW.stack_trace, ''));
        END;
      `);
    }
  }

  /**
   * Initialize default settings using Drizzle.
   */
  private initializeDefaultSettings(): void {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      // Use INSERT OR IGNORE for SQLite
      this.sqlite.prepare(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
      ).run(key, value);
    }
  }

  /**
   * Rebuild FTS index from existing data.
   * This is idempotent and safe to run multiple times.
   */
  private rebuildFTSIndex(): void {
    // Check if FTS table exists (created by migration)
    const ftsExists = this.sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='logs_fts'`
    ).get();

    if (ftsExists) {
      // Check if FTS index is empty but logs table has data
      const logsCount = this.sqlite.prepare('SELECT COUNT(*) as count FROM logs').get() as { count: number };
      const ftsCount = this.sqlite.prepare('SELECT COUNT(*) as count FROM logs_fts').get() as { count: number };
      
      // Only rebuild if logs exist but FTS is empty (first-time setup after migration)
      if (logsCount.count > 0 && ftsCount.count === 0) {
        this.sqlite.exec(`
          INSERT INTO logs_fts(rowid, id, message, app_name, metadata, stack_trace)
          SELECT rowid, id, message, app_name, COALESCE(metadata, ''), COALESCE(stack_trace, '')
          FROM logs;
        `);
      }
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
    const sourceLocationRaw = row.source_location ?? row.sourceLocation;
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
      sourceLocation: sourceLocationRaw ? (typeof sourceLocationRaw === 'string' ? JSON.parse(sourceLocationRaw) : sourceLocationRaw) : undefined,
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
