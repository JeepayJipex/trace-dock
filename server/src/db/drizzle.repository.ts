import { eq, desc, asc, like, and, sql, count, sum, avg, min, type SQL } from 'drizzle-orm';
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
import type { DatabaseType } from './config';
import type { SchemaCollection } from './schema';

// Use any for Drizzle database instance since it varies by database type
// biome-ignore lint/suspicious/noExplicitAny: Drizzle DB types vary by database
type DrizzleDB = any;

interface DrizzleRepositoryOptions {
  db: DrizzleDB;
  schema: SchemaCollection;
  dbType: DatabaseType;
  debug?: boolean;
  // Optional raw connection for database-specific operations
  rawConnection?: unknown;
}

/**
 * Unified Drizzle repository that works with SQLite, PostgreSQL, and MySQL
 */
export class DrizzleRepository implements IRepository {
  protected db: DrizzleDB;
  protected schema: SchemaCollection;
  protected dbType: DatabaseType;
  protected rawConnection?: unknown;

  constructor(options: DrizzleRepositoryOptions) {
    this.db = options.db;
    this.schema = options.schema;
    this.dbType = options.dbType;
    this.rawConnection = options.rawConnection;
  }

  // ==================== Helper Functions ====================

  protected nowExpression(): SQL<unknown> {
    switch (this.dbType) {
      case 'sqlite':
        return sql`datetime('now')`;
      case 'postgresql':
        return sql`NOW()`;
      case 'mysql':
        return sql`NOW(3)`;
      default:
        return sql`datetime('now')`;
    }
  }

  protected dateSubtract(days: number): SQL<unknown> {
    switch (this.dbType) {
      case 'sqlite':
        return sql`datetime('now', '-' || ${days} || ' days')`;
      case 'postgresql':
        return sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`;
      case 'mysql':
        return sql`DATE_SUB(NOW(), INTERVAL ${days} DAY)`;
      default:
        return sql`datetime('now', '-' || ${days} || ' days')`;
    }
  }

  protected parseLogRow(row: Record<string, unknown>): LogEntry {
    return {
      id: row.id as string,
      timestamp: String(row.timestamp),
      level: row.level as LogEntry['level'],
      message: row.message as string,
      appName: row.appName as string,
      sessionId: row.sessionId as string,
      environment: typeof row.environment === 'string' ? JSON.parse(row.environment) : row.environment,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      stackTrace: (row.stackTrace as string) || undefined,
      context: row.context ? (typeof row.context === 'string' ? JSON.parse(row.context) : row.context) : undefined,
      errorGroupId: (row.errorGroupId as string) || undefined,
      traceId: (row.traceId as string) || undefined,
      spanId: (row.spanId as string) || undefined,
      parentSpanId: (row.parentSpanId as string) || undefined,
    };
  }

  protected parseErrorGroupRow(row: Record<string, unknown>): ErrorGroup {
    return {
      id: row.id as string,
      fingerprint: row.fingerprint as string,
      message: row.message as string,
      appName: row.appName as string,
      firstSeen: String(row.firstSeen),
      lastSeen: String(row.lastSeen),
      occurrenceCount: (row.occurrenceCount as number) ?? 1,
      status: ((row.status as string) ?? 'unreviewed') as ErrorGroupStatus,
      stackTracePreview: (row.stackTracePreview as string) || undefined,
    };
  }

  protected parseTraceRow(row: Record<string, unknown>): Trace {
    return {
      id: row.id as string,
      name: row.name as string,
      appName: row.appName as string,
      sessionId: row.sessionId as string,
      startTime: String(row.startTime),
      endTime: row.endTime ? String(row.endTime) : null,
      durationMs: row.durationMs as number | null,
      status: ((row.status as string) ?? 'running') as TraceStatus,
      spanCount: (row.spanCount as number) ?? 0,
      errorCount: (row.errorCount as number) ?? 0,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
    };
  }

  protected parseSpanRow(row: Record<string, unknown>): Span {
    return {
      id: row.id as string,
      traceId: row.traceId as string,
      parentSpanId: (row.parentSpanId as string) || null,
      name: row.name as string,
      operationType: (row.operationType as string) || null,
      startTime: String(row.startTime),
      endTime: row.endTime ? String(row.endTime) : null,
      durationMs: row.durationMs as number | null,
      status: ((row.status as string) ?? 'running') as TraceStatus,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
    };
  }

  protected generateErrorFingerprint(message: string, stackTrace: string | undefined, appName: string): string {
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

  protected upsertErrorGroup(log: LogEntry): string {
    const fingerprint = this.generateErrorFingerprint(log.message, log.stackTrace, log.appName);
    const { errorGroups } = this.schema;

    const existingGroup = (this.db
      .select({ id: errorGroups.id, occurrenceCount: errorGroups.occurrenceCount })
      .from(errorGroups)
      .where(eq(errorGroups.fingerprint, fingerprint)) as { get: () => { id: string; occurrenceCount: number | null } | undefined })
      .get();

    if (existingGroup) {
      (this.db
        .update(errorGroups)
        .set({
          lastSeen: log.timestamp,
          occurrenceCount: sql`${errorGroups.occurrenceCount} + 1`,
          updatedAt: this.nowExpression(),
        })
        .where(eq(errorGroups.id, existingGroup.id)) as { run: () => void })
        .run();

      return existingGroup.id;
    }
    const groupId = crypto.randomUUID();
    const stackTracePreview = log.stackTrace
      ? log.stackTrace.split('\n').slice(0, 3).join('\n')
      : null;

    (this.db.insert(errorGroups).values({
      id: groupId,
      fingerprint,
      message: log.message,
      appName: log.appName,
      firstSeen: log.timestamp,
      lastSeen: log.timestamp,
      stackTracePreview,
    }) as { run: () => void }).run();

    return groupId;
  }

  protected parseSearchQuery(search: string): { filters: Record<string, string>; freeText: string } {
    const filters: Record<string, string> = {};
    const filterRegex = /(\w+):(?:"([^"]+)"|(\S+))/g;
    let match: RegExpExecArray | null;
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
    const { logs } = this.schema;

    if (log.level === 'error') {
      errorGroupId = this.upsertErrorGroup(log);
    }

    (this.db.insert(logs).values({
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
    }) as { run: () => void }).run();

    return { errorGroupId };
  }

  getLogs(params: LogsQueryParams): PaginatedLogs {
    const { logs } = this.schema;
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle conditions are complex
    const conditions: any[] = [];

    let freeTextSearch = '';
    if (params.search) {
      const { filters, freeText } = this.parseSearchQuery(params.search);
      freeTextSearch = freeText;

      if (filters.level && !params.level) params.level = filters.level;
      if (filters.app && !params.appName) params.appName = filters.app;
      if (filters.session && !params.sessionId) params.sessionId = filters.session;
    }

    if (params.level) {
      conditions.push(eq(logs.level, params.level));
    }
    if (params.appName) {
      conditions.push(eq(logs.appName, params.appName));
    }
    if (params.sessionId) {
      conditions.push(eq(logs.sessionId, params.sessionId));
    }
    if (params.traceId) {
      conditions.push(eq(logs.traceId, params.traceId));
    }

    // Handle free text search with LIKE (FTS is SQLite-specific, handled in subclass)
    if (freeTextSearch) {
      conditions.push(like(logs.message, `%${freeTextSearch}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = (this.db
      .select({ count: count() })
      .from(logs)
      .where(whereClause) as { get: () => { count: number } | undefined })
      .get();

    const rows = (this.db
      .select()
      .from(logs)
      .where(whereClause)
      .orderBy(desc(logs.timestamp))
      .limit(params.limit)
      .offset(params.offset) as { all: () => Record<string, unknown>[] })
      .all();

    return {
      logs: rows.map((r) => this.parseLogRow(r)),
      total: totalResult?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }

  getLogById(id: string): LogEntry | null {
    const { logs } = this.schema;
    const row = (this.db.select().from(logs).where(eq(logs.id, id)) as { get: () => Record<string, unknown> | undefined }).get();
    return row ? this.parseLogRow(row) : null;
  }

  getRecentLogs(limit = 50): LogEntry[] {
    const { logs } = this.schema;
    const rows = (this.db
      .select()
      .from(logs)
      .orderBy(desc(logs.timestamp))
      .limit(limit) as { all: () => Record<string, unknown>[] })
      .all();
    return rows.map((r) => this.parseLogRow(r));
  }

  getStats(): LogStats {
    const { logs } = this.schema;

    const totalResult = (this.db.select({ count: count() }).from(logs) as { get: () => { count: number } | undefined }).get();
    const total = totalResult?.count ?? 0;

    const byLevelRows = (this.db
      .select({ level: logs.level, count: count() })
      .from(logs)
      .groupBy(logs.level) as { all: () => { level: string; count: number }[] })
      .all();
    const byLevel = Object.fromEntries(byLevelRows.map((r) => [r.level, r.count]));

    const byAppRows = (this.db
      .select({ appName: logs.appName, count: count() })
      .from(logs)
      .groupBy(logs.appName) as { all: () => { appName: string; count: number }[] })
      .all();
    const byApp = Object.fromEntries(byAppRows.map((r) => [r.appName, r.count]));

    return { total, byLevel, byApp };
  }

  getAppNames(): string[] {
    const { logs } = this.schema;
    const rows = (this.db
      .selectDistinct({ appName: logs.appName })
      .from(logs)
      .orderBy(logs.appName) as { all: () => { appName: string }[] })
      .all();
    return rows.map((r) => r.appName);
  }

  getSessionIds(appName?: string): string[] {
    const { logs } = this.schema;
    let query = this.db.selectDistinct({ sessionId: logs.sessionId }).from(logs);

    if (appName) {
      query = (query as { where: (condition: unknown) => typeof query }).where(eq(logs.appName, appName));
    }

    const rows = (query.orderBy(desc(logs.sessionId)).limit(100) as { all: () => { sessionId: string }[] }).all();
    return rows.map((r) => r.sessionId);
  }

  getMetadataKeys(): string[] {
    const { logs } = this.schema;
    // Get recent metadata entries to extract keys
    const rows = (this.db
      .select({ metadata: logs.metadata })
      .from(logs)
      .where(sql`${logs.metadata} IS NOT NULL`)
      .orderBy(desc(logs.createdAt))
      .limit(500) as { all: () => { metadata: string | null }[] })
      .all();

    const keysSet = new Set<string>();
    for (const row of rows) {
      if (row.metadata) {
        try {
          const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          for (const key of Object.keys(metadata)) {
            keysSet.add(key);
          }
        } catch {
          // Ignore parse errors
        }
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
      const filteredLogs = baseResult.logs.filter(
        (log) => !log.errorGroupId || !ignoredIds.includes(log.errorGroupId)
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
    const { logs } = this.schema;
    const rows = (this.db
      .select()
      .from(logs)
      .where(eq(logs.traceId, traceId))
      .orderBy(asc(logs.timestamp))
      .limit(limit) as { all: () => Record<string, unknown>[] })
      .all();
    return rows.map((r) => this.parseLogRow(r));
  }

  // ==================== Error Groups ====================

  getErrorGroups(params: ErrorGroupsQueryParams): PaginatedErrorGroups {
    const { errorGroups } = this.schema;
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle conditions are complex
    const conditions: any[] = [];

    if (params.appName) {
      conditions.push(eq(errorGroups.appName, params.appName));
    }
    if (params.status) {
      conditions.push(eq(errorGroups.status, params.status));
    }
    if (params.search) {
      conditions.push(like(errorGroups.message, `%${params.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = (this.db
      .select({ count: count() })
      .from(errorGroups)
      .where(whereClause) as { get: () => { count: number } | undefined })
      .get();

    const sortColumn =
      params.sortBy === 'first_seen'
        ? errorGroups.firstSeen
        : params.sortBy === 'occurrence_count'
          ? errorGroups.occurrenceCount
          : errorGroups.lastSeen;

    const orderFn = params.sortOrder === 'asc' ? asc : desc;

    const rows = (this.db
      .select()
      .from(errorGroups)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(params.limit)
      .offset(params.offset) as { all: () => Record<string, unknown>[] })
      .all();

    return {
      errorGroups: rows.map((r) => this.parseErrorGroupRow(r)),
      total: totalResult?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }

  getErrorGroupById(id: string): ErrorGroup | null {
    const { errorGroups } = this.schema;
    const row = (this.db.select().from(errorGroups).where(eq(errorGroups.id, id)) as { get: () => Record<string, unknown> | undefined }).get();
    return row ? this.parseErrorGroupRow(row) : null;
  }

  updateErrorGroupStatus(id: string, status: ErrorGroupStatus): boolean {
    const { errorGroups } = this.schema;
    const result = (this.db
      .update(errorGroups)
      .set({ status, updatedAt: this.nowExpression() })
      .where(eq(errorGroups.id, id)) as { run: () => { changes: number } })
      .run();
    return result.changes > 0;
  }

  getErrorGroupOccurrences(groupId: string, limit = 50, offset = 0): PaginatedLogs {
    const { logs } = this.schema;

    const totalResult = (this.db
      .select({ count: count() })
      .from(logs)
      .where(eq(logs.errorGroupId, groupId)) as { get: () => { count: number } | undefined })
      .get();

    const rows = (this.db
      .select()
      .from(logs)
      .where(eq(logs.errorGroupId, groupId))
      .orderBy(desc(logs.timestamp))
      .limit(limit)
      .offset(offset) as { all: () => Record<string, unknown>[] })
      .all();

    return {
      logs: rows.map((r) => this.parseLogRow(r)),
      total: totalResult?.count ?? 0,
      limit,
      offset,
    };
  }

  getErrorGroupStats(): ErrorGroupStats {
    const { errorGroups } = this.schema;

    const totalGroups =
      (this.db.select({ count: count() }).from(errorGroups) as { get: () => { count: number } | undefined }).get()?.count ?? 0;

    const totalOccurrencesResult = (this.db
      .select({ sum: sum(errorGroups.occurrenceCount) })
      .from(errorGroups) as { get: () => { sum: string | number | null } | undefined })
      .get();
    const totalOccurrences = Number(totalOccurrencesResult?.sum) || 0;

    const byStatusRows = (this.db
      .select({ status: errorGroups.status, count: count() })
      .from(errorGroups)
      .groupBy(errorGroups.status) as { all: () => { status: string | null; count: number }[] })
      .all();

    const byStatus: Record<ErrorGroupStatus, number> = {
      unreviewed: 0,
      reviewed: 0,
      ignored: 0,
      resolved: 0,
      ...Object.fromEntries(byStatusRows.map((r) => [r.status, r.count])),
    };

    const byAppRows = (this.db
      .select({ appName: errorGroups.appName, count: count() })
      .from(errorGroups)
      .groupBy(errorGroups.appName) as { all: () => { appName: string; count: number }[] })
      .all();
    const byApp = Object.fromEntries(byAppRows.map((r) => [r.appName, r.count]));

    // Recent trend - simplified version (database-specific date handling would need adjustment)
    const recentTrend: { date: string; count: number }[] = [];

    return {
      totalGroups,
      totalOccurrences,
      byStatus,
      byApp,
      recentTrend,
    };
  }

  getIgnoredErrorGroupIds(): string[] {
    const { errorGroups } = this.schema;
    const rows = (this.db
      .select({ id: errorGroups.id })
      .from(errorGroups)
      .where(eq(errorGroups.status, 'ignored')) as { all: () => { id: string }[] })
      .all();
    return rows.map((r) => r.id);
  }

  // ==================== Traces ====================

  getTraces(params: TracesQueryParams): PaginatedTraces {
    const { traces } = this.schema;
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle conditions are complex
    const conditions: any[] = [];

    if (params.appName) {
      conditions.push(eq(traces.appName, params.appName));
    }
    if (params.sessionId) {
      conditions.push(eq(traces.sessionId, params.sessionId));
    }
    if (params.status) {
      conditions.push(eq(traces.status, params.status));
    }
    if (params.name) {
      conditions.push(like(traces.name, `%${params.name}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = (this.db
      .select({ count: count() })
      .from(traces)
      .where(whereClause) as { get: () => { count: number } | undefined })
      .get();

    const rows = (this.db
      .select()
      .from(traces)
      .where(whereClause)
      .orderBy(desc(traces.startTime))
      .limit(params.limit)
      .offset(params.offset) as { all: () => Record<string, unknown>[] })
      .all();

    return {
      traces: rows.map((r) => this.parseTraceRow(r)),
      total: totalResult?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }

  getTraceById(id: string): Trace | null {
    const { traces } = this.schema;
    const row = (this.db.select().from(traces).where(eq(traces.id, id)) as { get: () => Record<string, unknown> | undefined }).get();
    return row ? this.parseTraceRow(row) : null;
  }

  createTrace(trace: Omit<Trace, 'spanCount' | 'errorCount'>): Trace {
    const { traces } = this.schema;

    (this.db.insert(traces).values({
      id: trace.id,
      name: trace.name,
      appName: trace.appName,
      sessionId: trace.sessionId,
      startTime: trace.startTime,
      endTime: trace.endTime,
      durationMs: trace.durationMs,
      status: trace.status,
      metadata: trace.metadata ? JSON.stringify(trace.metadata) : null,
    }) as { run: () => void }).run();

    return { ...trace, spanCount: 0, errorCount: 0 };
  }

  updateTrace(id: string, updates: Partial<Pick<Trace, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean {
    const { traces } = this.schema;
    const setValues: Record<string, unknown> = {};

    if (updates.endTime !== undefined) setValues.endTime = updates.endTime;
    if (updates.durationMs !== undefined) setValues.durationMs = updates.durationMs;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.metadata !== undefined) setValues.metadata = JSON.stringify(updates.metadata);

    if (Object.keys(setValues).length === 0) return false;

    const result = (this.db.update(traces).set(setValues).where(eq(traces.id, id)) as { run: () => { changes: number } }).run();

    return result.changes > 0;
  }

  getTraceStats(): TraceStats {
    const { traces } = this.schema;

    const totalTraces =
      (this.db.select({ count: count() }).from(traces) as { get: () => { count: number } | undefined }).get()?.count ?? 0;

    const avgResult = (this.db
      .select({ avg: avg(traces.durationMs) })
      .from(traces) as { get: () => { avg: string | number | null } | undefined })
      .get();
    const avgDurationMs = Number(avgResult?.avg) || 0;

    const byStatusRows = (this.db
      .select({ status: traces.status, count: count() })
      .from(traces)
      .groupBy(traces.status) as { all: () => { status: string | null; count: number }[] })
      .all();

    const byStatus: Record<TraceStatus, number> = {
      running: 0,
      completed: 0,
      error: 0,
      ...Object.fromEntries(byStatusRows.map((r) => [r.status, r.count])),
    };

    const byAppRows = (this.db
      .select({ appName: traces.appName, count: count() })
      .from(traces)
      .groupBy(traces.appName) as { all: () => { appName: string; count: number }[] })
      .all();
    const byApp = Object.fromEntries(byAppRows.map((r) => [r.appName, r.count]));

    // Recent trend - simplified
    const recentTrend: { date: string; count: number; avgDuration: number }[] = [];

    return {
      totalTraces,
      avgDurationMs,
      byStatus,
      byApp,
      recentTrend,
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
    const { spans } = this.schema;
    const rows = (this.db
      .select()
      .from(spans)
      .where(eq(spans.traceId, traceId))
      .orderBy(asc(spans.startTime)) as { all: () => Record<string, unknown>[] })
      .all();
    return rows.map((r) => this.parseSpanRow(r));
  }

  getSpanById(id: string): Span | null {
    const { spans } = this.schema;
    const row = (this.db.select().from(spans).where(eq(spans.id, id)) as { get: () => Record<string, unknown> | undefined }).get();
    return row ? this.parseSpanRow(row) : null;
  }

  createSpan(span: Span): Span {
    const { spans, traces } = this.schema;

    (this.db.insert(spans).values({
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
    }) as { run: () => void }).run();

    // Update trace span count
    (this.db
      .update(traces)
      .set({ spanCount: sql`${traces.spanCount} + 1` })
      .where(eq(traces.id, span.traceId)) as { run: () => void })
      .run();

    return span;
  }

  updateSpan(id: string, updates: Partial<Pick<Span, 'endTime' | 'durationMs' | 'status' | 'metadata'>>): boolean {
    const { spans, traces } = this.schema;
    const setValues: Record<string, unknown> = {};

    if (updates.endTime !== undefined) setValues.endTime = updates.endTime;
    if (updates.durationMs !== undefined) setValues.durationMs = updates.durationMs;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.metadata !== undefined) setValues.metadata = JSON.stringify(updates.metadata);

    if (Object.keys(setValues).length === 0) return false;

    const span = this.getSpanById(id);
    const result = (this.db.update(spans).set(setValues).where(eq(spans.id, id)) as { run: () => { changes: number } }).run();

    // Update trace error count if span status changed to error
    if (result.changes > 0 && span && updates.status === 'error') {
      (this.db
        .update(traces)
        .set({ errorCount: sql`${traces.errorCount} + 1` })
        .where(eq(traces.id, span.traceId)) as { run: () => void })
        .run();
    }

    return result.changes > 0;
  }

  // ==================== Settings ====================

  getSettings(): RetentionSettings {
    const { settings } = this.schema;
    const rows = (this.db.select().from(settings) as { all: () => { key: string; value: string }[] }).all();
    const settingsMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return {
      logsRetentionDays: Number.parseInt(settingsMap['retention.logs_days'] || '7', 10),
      tracesRetentionDays: Number.parseInt(settingsMap['retention.traces_days'] || '14', 10),
      spansRetentionDays: Number.parseInt(settingsMap['retention.spans_days'] || '14', 10),
      errorGroupsRetentionDays: Number.parseInt(settingsMap['retention.error_groups_days'] || '30', 10),
      cleanupEnabled: settingsMap['cleanup.enabled'] === 'true',
      cleanupIntervalHours: Number.parseInt(settingsMap['cleanup.interval_hours'] || '1', 10),
    };
  }

  updateSettings(updates: Partial<RetentionSettings>): RetentionSettings {
    const { settings } = this.schema;

    const upsert = (key: string, value: string) => {
      // Try to update first, then insert if no rows affected
      const existing = (this.db.select().from(settings).where(eq(settings.key, key)) as { get: () => unknown }).get();
      if (existing) {
        (this.db
          .update(settings)
          .set({ value, updatedAt: this.nowExpression() })
          .where(eq(settings.key, key)) as { run: () => void })
          .run();
      } else {
        (this.db.insert(settings).values({ key, value }) as { run: () => void }).run();
      }
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
    const { logs, traces, spans, errorGroups } = this.schema;

    const totalLogs = (this.db.select({ count: count() }).from(logs) as { get: () => { count: number } | undefined }).get()?.count ?? 0;
    const totalTraces = (this.db.select({ count: count() }).from(traces) as { get: () => { count: number } | undefined }).get()?.count ?? 0;
    const totalSpans = (this.db.select({ count: count() }).from(spans) as { get: () => { count: number } | undefined }).get()?.count ?? 0;
    const totalErrorGroups =
      (this.db.select({ count: count() }).from(errorGroups) as { get: () => { count: number } | undefined }).get()?.count ?? 0;

    // Database size is database-specific - return 0 for generic implementation
    const databaseSizeBytes = 0;

    const oldestLogRow = (this.db.select({ oldest: min(logs.timestamp) }).from(logs) as { get: () => { oldest: unknown } | undefined }).get();
    const oldestTraceRow = (this.db.select({ oldest: min(traces.startTime) }).from(traces) as { get: () => { oldest: unknown } | undefined }).get();

    return {
      totalLogs,
      totalTraces,
      totalSpans,
      totalErrorGroups,
      databaseSizeBytes,
      oldestLog: oldestLogRow?.oldest ? String(oldestLogRow.oldest) : null,
      oldestTrace: oldestTraceRow?.oldest ? String(oldestTraceRow.oldest) : null,
    };
  }

  // ==================== Cleanup ====================

  cleanupOldLogs(retentionDays: number): number {
    if (retentionDays <= 0) return 0;

    const { logs } = this.schema;
    const result = (this.db
      .delete(logs)
      .where(sql`${logs.timestamp} < ${this.dateSubtract(retentionDays)}`) as { run: () => { changes: number } })
      .run();

    return result.changes;
  }

  cleanupOldTraces(retentionDays: number): number {
    if (retentionDays <= 0) return 0;

    const { traces } = this.schema;
    const result = (this.db
      .delete(traces)
      .where(sql`${traces.startTime} < ${this.dateSubtract(retentionDays)}`) as { run: () => { changes: number } })
      .run();

    return result.changes;
  }

  cleanupOldSpans(retentionDays: number): number {
    if (retentionDays <= 0) return 0;

    const { spans } = this.schema;
    const result = (this.db
      .delete(spans)
      .where(sql`${spans.startTime} < ${this.dateSubtract(retentionDays)}`) as { run: () => { changes: number } })
      .run();

    return result.changes;
  }

  cleanupOldErrorGroups(retentionDays: number): number {
    if (retentionDays <= 0) return 0;

    const { errorGroups } = this.schema;
    const result = (this.db
      .delete(errorGroups)
      .where(sql`${errorGroups.lastSeen} < ${this.dateSubtract(retentionDays)}`) as { run: () => { changes: number } })
      .run();

    return result.changes;
  }

  cleanupOrphanedSpans(): number {
    const { spans, traces } = this.schema;
    const result = (this.db
      .delete(spans)
      .where(sql`${spans.traceId} NOT IN (SELECT ${traces.id} FROM ${traces})`) as { run: () => { changes: number } })
      .run();

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
    // Override in subclasses to close database connections
  }
}
