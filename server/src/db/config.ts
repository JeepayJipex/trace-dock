/**
 * Supported database types
 */
export type DatabaseType = 'sqlite' | 'postgresql' | 'mysql';

/**
 * Database configuration based on environment variables
 */
export interface DatabaseConfig {
  type: DatabaseType;
  /** Connection string (for PostgreSQL/MySQL) or file path (for SQLite) */
  url: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Default settings for retention
 */
export const DEFAULT_SETTINGS: Record<string, string> = {
  'retention.logs_days': '7',
  'retention.traces_days': '14',
  'retention.spans_days': '14',
  'retention.error_groups_days': '30',
  'cleanup.enabled': 'true',
  'cleanup.interval_hours': '1',
};

/**
 * Parse database configuration from environment variables
 * 
 * Environment variables:
 * - DB_TYPE: 'sqlite' | 'postgresql' | 'mysql' (default: 'sqlite')
 * - DATABASE_URL: Connection string (for PostgreSQL/MySQL) or file path (for SQLite)
 * - DB_DEBUG: Enable debug logging ('true' | 'false')
 * 
 * For SQLite, if DATABASE_URL is not provided, uses default path: ./data/trace-dock.sqlite
 */
export function getDatabaseConfig(): DatabaseConfig {
  const dbType = (process.env.DB_TYPE || 'sqlite') as DatabaseType;
  const debug = process.env.DB_DEBUG === 'true';
  
  let url: string;
  
  switch (dbType) {
    case 'postgresql':
      url = process.env.DATABASE_URL || 'postgres://localhost:5432/tracedock';
      break;
    case 'mysql':
      url = process.env.DATABASE_URL || 'mysql://localhost:3306/tracedock';
      break;
    case 'sqlite':
    default:
      // For SQLite, use DATA_DIR and DB_PATH for backwards compatibility
      const dataDir = process.env.DATA_DIR || './data';
      url = process.env.DATABASE_URL || process.env.DB_PATH || `${dataDir}/trace-dock.sqlite`;
      break;
  }
  
  return { type: dbType, url, debug };
}
