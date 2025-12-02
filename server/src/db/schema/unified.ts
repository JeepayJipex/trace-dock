/**
 * Unified schema definitions for cross-database Drizzle repository
 * 
 * This module provides schema accessors that work with any supported database type.
 * The repository uses these to dynamically select the correct table definitions.
 */
import type { DatabaseType } from '../config';

import { sqliteLogs, pgLogs, mysqlLogs } from './logs';
import { sqliteTraces, pgTraces, mysqlTraces } from './traces';
import { sqliteSpans, pgSpans, mysqlSpans } from './spans';
import { sqliteErrorGroups, pgErrorGroups, mysqlErrorGroups } from './errorGroups';
import { sqliteSettings, pgSettings, mysqlSettings } from './settings';

// Schema collection type for each database
export interface SchemaCollection {
  logs: typeof sqliteLogs | typeof pgLogs | typeof mysqlLogs;
  traces: typeof sqliteTraces | typeof pgTraces | typeof mysqlTraces;
  spans: typeof sqliteSpans | typeof pgSpans | typeof mysqlSpans;
  errorGroups: typeof sqliteErrorGroups | typeof pgErrorGroups | typeof mysqlErrorGroups;
  settings: typeof sqliteSettings | typeof pgSettings | typeof mysqlSettings;
}

// SQLite schema collection
export const sqliteSchema: SchemaCollection = {
  logs: sqliteLogs,
  traces: sqliteTraces,
  spans: sqliteSpans,
  errorGroups: sqliteErrorGroups,
  settings: sqliteSettings,
};

// PostgreSQL schema collection  
export const pgSchema: SchemaCollection = {
  logs: pgLogs,
  traces: pgTraces,
  spans: pgSpans,
  errorGroups: pgErrorGroups,
  settings: pgSettings,
};

// MySQL schema collection
export const mysqlSchema: SchemaCollection = {
  logs: mysqlLogs,
  traces: mysqlTraces,
  spans: mysqlSpans,
  errorGroups: mysqlErrorGroups,
  settings: mysqlSettings,
};

/**
 * Get the schema collection for a specific database type
 */
export function getSchemaForType(dbType: DatabaseType): SchemaCollection {
  switch (dbType) {
    case 'sqlite':
      return sqliteSchema;
    case 'postgresql':
      return pgSchema;
    case 'mysql':
      return mysqlSchema;
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

// Export all schemas for Drizzle config files
export const schemas = {
  sqlite: {
    logs: sqliteLogs,
    traces: sqliteTraces,
    spans: sqliteSpans,
    errorGroups: sqliteErrorGroups,
    settings: sqliteSettings,
  },
  postgresql: {
    logs: pgLogs,
    traces: pgTraces,
    spans: pgSpans,
    errorGroups: pgErrorGroups,
    settings: pgSettings,
  },
  mysql: {
    logs: mysqlLogs,
    traces: mysqlTraces,
    spans: mysqlSpans,
    errorGroups: mysqlErrorGroups,
    settings: mysqlSettings,
  },
} as const;
