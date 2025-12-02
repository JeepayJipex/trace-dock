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

// Factory - main entry point for getting repository
export { createRepository, initRepository, getRepository, setRepository, closeRepository } from './factory';

// Concrete implementations (for advanced usage)
export { SQLiteRepository } from './sqlite-drizzle.repository';
export { DrizzleRepository } from './drizzle.repository';

// Cleanup job management
import { getRepository } from './factory';

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
