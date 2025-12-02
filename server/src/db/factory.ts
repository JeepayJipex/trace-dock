import type { IRepository } from './repository.interface';
import { getDatabaseConfig, type DatabaseConfig } from './config';
import { SQLiteRepository } from './sqlite-drizzle.repository';
import { DrizzleRepository } from './drizzle.repository';
import { pgSchema, mysqlSchema } from './schema';

/**
 * Create a repository based on database configuration.
 * 
 * @example
 * // Auto-detect from environment variables
 * const repo = await createRepository();
 * 
 * @example
 * // Explicit SQLite configuration
 * const repo = await createRepository({ type: 'sqlite', url: './data/db.sqlite' });
 * 
 * @example
 * // PostgreSQL
 * const repo = await createRepository({ type: 'postgresql', url: 'postgres://...' });
 */
export async function createRepository(config?: DatabaseConfig): Promise<IRepository> {
  const dbConfig = config || getDatabaseConfig();
  
  switch (dbConfig.type) {
    case 'sqlite':
      return new SQLiteRepository(dbConfig.url, dbConfig.debug);
    
    case 'postgresql': {
      const { drizzle } = await import('drizzle-orm/node-postgres');
      const pg = await import('pg');
      
      const pool = new pg.default.Pool({
        connectionString: dbConfig.url,
      });
      
      const db = drizzle(pool, { logger: dbConfig.debug });
      
      return new DrizzleRepository({
        db,
        schema: pgSchema,
        dbType: 'postgresql',
        debug: dbConfig.debug,
        rawConnection: pool,
      });
    }
    
    case 'mysql': {
      const { drizzle } = await import('drizzle-orm/mysql2');
      const mysql = await import('mysql2/promise');
      
      const pool = await mysql.createPool(dbConfig.url);
      
      const db = drizzle(pool, { logger: dbConfig.debug });
      
      return new DrizzleRepository({
        db,
        schema: mysqlSchema,
        dbType: 'mysql',
        debug: dbConfig.debug,
        rawConnection: pool,
      });
    }
    
    default:
      throw new Error(`Unsupported database type: ${dbConfig.type}`);
  }
}

// Singleton instance for the application
let repositoryInstance: IRepository | null = null;

/**
 * Initialize the repository singleton. Call this once at application startup.
 * 
 * @example
 * await initRepository();
 * const repo = getRepository();
 */
export async function initRepository(config?: DatabaseConfig): Promise<IRepository> {
  if (repositoryInstance) {
    return repositoryInstance;
  }
  repositoryInstance = await createRepository(config);
  return repositoryInstance;
}

/**
 * Get the repository singleton. Must call initRepository() first.
 * 
 * @throws Error if repository not initialized
 */
export function getRepository(): IRepository {
  if (!repositoryInstance) {
    throw new Error('Repository not initialized. Call initRepository() at application startup.');
  }
  return repositoryInstance;
}

/**
 * Set a custom repository instance (useful for testing)
 */
export function setRepository(repo: IRepository): void {
  repositoryInstance = repo;
}

/**
 * Close and reset the repository singleton
 */
export function closeRepository(): void {
  if (repositoryInstance) {
    repositoryInstance.close();
    repositoryInstance = null;
  }
}
