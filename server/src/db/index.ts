// Repository interface and types
export type {
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

// Configuration
export { getDatabaseConfig, DEFAULT_SETTINGS, type DatabaseConfig, type DatabaseType } from './config';

// Factory
export { createRepository, getRepository, setRepository, closeRepository } from './factory';

// Concrete implementations
export { SQLiteRepository } from './sqlite.repository';

// Legacy compatibility - these will be deprecated
// Import from factory for backwards compatibility
import { getRepository } from './factory';

/**
 * @deprecated Use getRepository() instead
 */
export const insertLogEntry = (...args: Parameters<ReturnType<typeof getRepository>['insertLog']>) => 
  getRepository().insertLog(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getLogs = (...args: Parameters<ReturnType<typeof getRepository>['getLogs']>) => 
  getRepository().getLogs(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getLogById = (...args: Parameters<ReturnType<typeof getRepository>['getLogById']>) => 
  getRepository().getLogById(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getRecentLogs = (...args: Parameters<ReturnType<typeof getRepository>['getRecentLogs']>) => 
  getRepository().getRecentLogs(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getStats = () => getRepository().getStats();

/**
 * @deprecated Use getRepository() instead
 */
export const getAppNames = () => getRepository().getAppNames();

/**
 * @deprecated Use getRepository() instead
 */
export const getSessionIds = (...args: Parameters<ReturnType<typeof getRepository>['getSessionIds']>) => 
  getRepository().getSessionIds(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getSearchSuggestions = (...args: Parameters<ReturnType<typeof getRepository>['getSearchSuggestions']>) => 
  getRepository().getSearchSuggestions(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getMetadataKeys = () => getRepository().getMetadataKeys();

/**
 * @deprecated Use getRepository() instead
 */
export const getErrorGroups = (...args: Parameters<ReturnType<typeof getRepository>['getErrorGroups']>) => 
  getRepository().getErrorGroups(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getErrorGroupById = (...args: Parameters<ReturnType<typeof getRepository>['getErrorGroupById']>) => 
  getRepository().getErrorGroupById(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const updateErrorGroupStatus = (...args: Parameters<ReturnType<typeof getRepository>['updateErrorGroupStatus']>) => 
  getRepository().updateErrorGroupStatus(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getErrorGroupOccurrences = (...args: Parameters<ReturnType<typeof getRepository>['getErrorGroupOccurrences']>) => 
  getRepository().getErrorGroupOccurrences(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getErrorGroupStats = () => getRepository().getErrorGroupStats();

/**
 * @deprecated Use getRepository() instead
 */
export const getLogsWithIgnoredInfo = (...args: Parameters<ReturnType<typeof getRepository>['getLogsWithIgnoredInfo']>) => 
  getRepository().getLogsWithIgnoredInfo(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getTraces = (...args: Parameters<ReturnType<typeof getRepository>['getTraces']>) => 
  getRepository().getTraces(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getTraceById = (...args: Parameters<ReturnType<typeof getRepository>['getTraceById']>) => 
  getRepository().getTraceById(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getSpansByTraceId = (...args: Parameters<ReturnType<typeof getRepository>['getSpansByTraceId']>) => 
  getRepository().getSpansByTraceId(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getSpanById = (...args: Parameters<ReturnType<typeof getRepository>['getSpanById']>) => 
  getRepository().getSpanById(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const createTrace = (...args: Parameters<ReturnType<typeof getRepository>['createTrace']>) => 
  getRepository().createTrace(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const updateTrace = (...args: Parameters<ReturnType<typeof getRepository>['updateTrace']>) => 
  getRepository().updateTrace(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const createSpan = (...args: Parameters<ReturnType<typeof getRepository>['createSpan']>) => 
  getRepository().createSpan(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const updateSpan = (...args: Parameters<ReturnType<typeof getRepository>['updateSpan']>) => 
  getRepository().updateSpan(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getTraceStats = () => getRepository().getTraceStats();

/**
 * @deprecated Use getRepository() instead
 */
export const getLogsByTraceId = (...args: Parameters<ReturnType<typeof getRepository>['getLogsByTraceId']>) => 
  getRepository().getLogsByTraceId(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getTraceWithDetails = (...args: Parameters<ReturnType<typeof getRepository>['getTraceWithDetails']>) => 
  getRepository().getTraceWithDetails(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getSettings = () => getRepository().getSettings();

/**
 * @deprecated Use getRepository() instead
 */
export const updateSettings = (...args: Parameters<ReturnType<typeof getRepository>['updateSettings']>) => 
  getRepository().updateSettings(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const getStorageStats = () => getRepository().getStorageStats();

/**
 * @deprecated Use getRepository() instead
 */
export const runCleanup = () => getRepository().runCleanup();

/**
 * @deprecated Use getRepository() instead
 */
export const cleanupOldLogs = (...args: Parameters<ReturnType<typeof getRepository>['cleanupOldLogs']>) => 
  getRepository().cleanupOldLogs(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const cleanupOldTraces = (...args: Parameters<ReturnType<typeof getRepository>['cleanupOldTraces']>) => 
  getRepository().cleanupOldTraces(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const cleanupOldSpans = (...args: Parameters<ReturnType<typeof getRepository>['cleanupOldSpans']>) => 
  getRepository().cleanupOldSpans(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const cleanupOldErrorGroups = (...args: Parameters<ReturnType<typeof getRepository>['cleanupOldErrorGroups']>) => 
  getRepository().cleanupOldErrorGroups(...args);

/**
 * @deprecated Use getRepository() instead
 */
export const cleanupOrphanedSpans = () => getRepository().cleanupOrphanedSpans();

// Cleanup job management
let cleanupIntervalId: NodeJS.Timeout | null = null;

export function startCleanupJob(): void {
  const repo = getRepository();
  const settings = repo.getSettings();
  
  if (!settings.cleanupEnabled) {
    console.log('[Cleanup] Automatic cleanup is disabled');
    return;
  }

  const intervalMs = settings.cleanupIntervalHours * 60 * 60 * 1000;
  
  // Run immediately on start
  console.log('[Cleanup] Running initial cleanup...');
  const result = repo.runCleanup();
  console.log(`[Cleanup] Initial cleanup completed in ${result.durationMs}ms:`, {
    logsDeleted: result.logsDeleted,
    tracesDeleted: result.tracesDeleted,
    spansDeleted: result.spansDeleted,
    errorGroupsDeleted: result.errorGroupsDeleted,
  });

  // Schedule periodic cleanup
  cleanupIntervalId = setInterval(() => {
    const currentSettings = repo.getSettings();
    if (!currentSettings.cleanupEnabled) {
      console.log('[Cleanup] Cleanup skipped (disabled)');
      return;
    }

    console.log('[Cleanup] Running scheduled cleanup...');
    const result = repo.runCleanup();
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
