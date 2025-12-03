#!/usr/bin/env tsx
/**
 * Database setup script for Trace-Dock
 * 
 * Usage:
 *   pnpm db:setup                    # Setup using DB_TYPE env var (default: sqlite)
 *   pnpm db:setup --type=sqlite      # Setup SQLite database
 *   pnpm db:setup --type=postgresql  # Setup PostgreSQL database
 *   pnpm db:setup --type=mysql       # Setup MySQL database
 *   pnpm db:setup --help             # Show help
 */

import { parseArgs } from 'util';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';

type DatabaseType = 'sqlite' | 'postgresql' | 'mysql';

interface SetupOptions {
  type: DatabaseType;
  url?: string;
  force?: boolean;
}

function printHelp(): void {
  console.log(`
Database Setup for Trace-Dock
=============================

Usage:
  pnpm db:setup [options]

Options:
  --type=<type>     Database type: sqlite, postgresql, mysql
                    (default: sqlite or DB_TYPE env var)
  --url=<url>       Database URL or path
                    (default: from DATABASE_URL env var or type-specific default)
  --force           Force recreate database (WARNING: deletes existing data)
  --help            Show this help message

Environment Variables:
  DB_TYPE           Database type (sqlite, postgresql, mysql)
  DATABASE_URL      Database connection URL
  DATA_DIR          Data directory for SQLite (default: ./data)

Examples:
  # Setup SQLite (default)
  pnpm db:setup

  # Setup PostgreSQL
  pnpm db:setup --type=postgresql --url=postgres://user:pass@localhost:5432/tracedock

  # Setup MySQL
  pnpm db:setup --type=mysql --url=mysql://user:pass@localhost:3306/tracedock

  # Force recreate SQLite database
  pnpm db:setup --force
`);
}

function parseOptions(): SetupOptions | null {
  try {
    const { values } = parseArgs({
      options: {
        type: { type: 'string', short: 't' },
        url: { type: 'string', short: 'u' },
        force: { type: 'boolean', short: 'f' },
        help: { type: 'boolean', short: 'h' },
      },
    });

    if (values.help) {
      printHelp();
      return null;
    }

    const dbType = (values.type || process.env.DB_TYPE || 'sqlite') as DatabaseType;
    
    if (!['sqlite', 'postgresql', 'mysql'].includes(dbType)) {
      console.error(`Error: Invalid database type "${dbType}"`);
      console.error('Valid types: sqlite, postgresql, mysql');
      process.exit(1);
    }

    let url = values.url || process.env.DATABASE_URL;
    if (!url) {
      switch (dbType) {
        case 'sqlite':
          const dataDir = process.env.DATA_DIR || './data';
          url = `${dataDir}/trace-dock.sqlite`;
          break;
        case 'postgresql':
          url = 'postgres://localhost:5432/tracedock';
          break;
        case 'mysql':
          url = 'mysql://localhost:3306/tracedock';
          break;
      }
    }

    return {
      type: dbType,
      url,
      force: values.force,
    };
  } catch (error) {
    console.error('Error parsing arguments:', error);
    printHelp();
    process.exit(1);
  }
}

async function setupSQLite(options: SetupOptions): Promise<void> {
  const dbPath = options.url!;
  const absolutePath = resolve(dbPath);
  
  console.log(`Setting up SQLite database at: ${absolutePath}`);

  // Ensure directory exists
  const dir = dirname(absolutePath);
  if (!existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    mkdirSync(dir, { recursive: true });
  }

  // Check if database exists
  if (existsSync(absolutePath)) {
    if (options.force) {
      console.log('Force flag set, removing existing database...');
      rmSync(absolutePath, { force: true });
      // Also remove WAL files
      rmSync(`${absolutePath}-wal`, { force: true });
      rmSync(`${absolutePath}-shm`, { force: true });
    } else {
      console.log('Database already exists. Use --force to recreate.');
      return;
    }
  }

  // Create and initialize database using the SQLiteRepository
  const { SQLiteRepository } = await import('../src/db/sqlite-drizzle.repository');
  
  console.log('Initializing database schema...');
  const repo = new SQLiteRepository(absolutePath, { runMigrations: true });
  
  // Verify by checking stats
  const stats = repo.getStorageStats();
  console.log('Database initialized successfully!');
  console.log(`  Database size: ${stats.databaseSizeBytes} bytes`);
  
  repo.close();
  
  console.log(`
SQLite database setup complete!

To use this database, set the following environment variables:
  export DB_TYPE=sqlite
  export DATABASE_URL=${absolutePath}

Or in your .env file:
  DB_TYPE=sqlite
  DATABASE_URL=${absolutePath}
`);
}

async function setupPostgreSQL(options: SetupOptions): Promise<void> {
  const url = options.url!;
  console.log(`Setting up PostgreSQL database at: ${url.replace(/:[^:@]+@/, ':****@')}`);
  
  try {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pg = await import('pg');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    
    // Parse URL to get database name
    const urlObj = new URL(url);
    const dbName = urlObj.pathname.slice(1);
    const baseUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}`;
    
    // Connect to default database to create target database
    console.log('Connecting to PostgreSQL server...');
    const adminPool = new pg.default.Pool({ connectionString: `${baseUrl}/postgres` });
    
    try {
      if (options.force) {
        console.log(`Force flag set, dropping database "${dbName}" if exists...`);
        // Terminate existing connections
        await adminPool.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
        `, [dbName]);
        await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      }
      
      // Check if database exists
      const result = await adminPool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [dbName]
      );
      
      if (result.rows.length === 0) {
        console.log(`Creating database "${dbName}"...`);
        await adminPool.query(`CREATE DATABASE "${dbName}"`);
      } else {
        console.log(`Database "${dbName}" already exists.`);
      }
    } finally {
      await adminPool.end();
    }
    
    // Connect to target database and run migrations
    console.log('Running migrations...');
    const pool = new pg.default.Pool({ connectionString: url });
    const db = drizzle(pool);
    
    // Check if migrations directory exists
    const migrationsPath = resolve(__dirname, '../drizzle/postgresql');
    if (existsSync(migrationsPath)) {
      await migrate(db, { migrationsFolder: migrationsPath });
      console.log('Migrations applied successfully!');
    } else {
      console.log('No migrations found. Run "pnpm db:generate" to create migrations.');
    }
    
    await pool.end();
    
    console.log(`
PostgreSQL database setup complete!

To use this database, set the following environment variables:
  export DB_TYPE=postgresql
  export DATABASE_URL=${url.replace(/:[^:@]+@/, ':****@')}

Or in your .env file:
  DB_TYPE=postgresql
  DATABASE_URL=${url}
`);
  } catch (error) {
    console.error('Failed to setup PostgreSQL database:', error);
    process.exit(1);
  }
}

async function setupMySQL(options: SetupOptions): Promise<void> {
  const url = options.url!;
  console.log(`Setting up MySQL database at: ${url.replace(/:[^:@]+@/, ':****@')}`);
  
  try {
    const { drizzle } = await import('drizzle-orm/mysql2');
    const mysql = await import('mysql2/promise');
    const { migrate } = await import('drizzle-orm/mysql2/migrator');
    
    // Parse URL to get database name
    const urlObj = new URL(url);
    const dbName = urlObj.pathname.slice(1);
    const baseUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}`;
    
    // Connect to MySQL without database to create target database
    console.log('Connecting to MySQL server...');
    const adminConnection = await mysql.createConnection(baseUrl);
    
    try {
      if (options.force) {
        console.log(`Force flag set, dropping database "${dbName}" if exists...`);
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      }
      
      // Check if database exists
      const [rows] = await adminConnection.query(
        `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
        [dbName]
      );
      
      if ((rows as unknown[]).length === 0) {
        console.log(`Creating database "${dbName}"...`);
        await adminConnection.query(`CREATE DATABASE \`${dbName}\``);
      } else {
        console.log(`Database "${dbName}" already exists.`);
      }
    } finally {
      await adminConnection.end();
    }
    
    // Connect to target database and run migrations
    console.log('Running migrations...');
    const pool = await mysql.createPool(url);
    const db = drizzle(pool);
    
    // Check if migrations directory exists
    const migrationsPath = resolve(__dirname, '../drizzle/mysql');
    if (existsSync(migrationsPath)) {
      await migrate(db, { migrationsFolder: migrationsPath });
      console.log('Migrations applied successfully!');
    } else {
      console.log('No migrations found. Run "pnpm db:generate" to create migrations.');
    }
    
    await pool.end();
    
    console.log(`
MySQL database setup complete!

To use this database, set the following environment variables:
  export DB_TYPE=mysql
  export DATABASE_URL=${url.replace(/:[^:@]+@/, ':****@')}

Or in your .env file:
  DB_TYPE=mysql
  DATABASE_URL=${url}
`);
  } catch (error) {
    console.error('Failed to setup MySQL database:', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log('Trace-Dock Database Setup\n');
  
  const options = parseOptions();
  if (!options) {
    return; // Help was printed
  }

  console.log(`Database type: ${options.type}`);
  
  switch (options.type) {
    case 'sqlite':
      await setupSQLite(options);
      break;
    case 'postgresql':
      await setupPostgreSQL(options);
      break;
    case 'mysql':
      await setupMySQL(options);
      break;
  }
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
