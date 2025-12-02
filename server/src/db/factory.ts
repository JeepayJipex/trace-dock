import type { IRepository } from './repository.interface';
import { getDatabaseConfig, type DatabaseConfig } from './config';
import { SQLiteRepository } from './sqlite.repository';

/**
 * Factory to create the appropriate repository based on database configuration
 */
export function createRepository(config?: DatabaseConfig): IRepository {
  const dbConfig = config || getDatabaseConfig();
  
  switch (dbConfig.type) {
    case 'sqlite':
      return new SQLiteRepository(dbConfig.url, dbConfig.debug);
    
    case 'postgresql':
      // TODO: Implement PostgreSQL repository
      throw new Error('PostgreSQL support is not yet implemented. Please use DB_TYPE=sqlite for now.');
    
    case 'mysql':
      // TODO: Implement MySQL repository
      throw new Error('MySQL support is not yet implemented. Please use DB_TYPE=sqlite for now.');
    
    default:
      throw new Error(`Unsupported database type: ${dbConfig.type}`);
  }
}

// Singleton instance for the application
let repositoryInstance: IRepository | null = null;

/**
 * Get or create the repository singleton
 */
export function getRepository(): IRepository {
  if (!repositoryInstance) {
    repositoryInstance = createRepository();
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
