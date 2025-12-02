#!/usr/bin/env tsx
/**
 * Database migration generation script for Trace-Dock
 * 
 * Usage:
 *   pnpm db:generate                  # Generate for all database types
 *   pnpm db:generate --type=sqlite    # Generate for SQLite only
 *   pnpm db:generate --type=postgresql # Generate for PostgreSQL only
 *   pnpm db:generate --type=mysql     # Generate for MySQL only
 *   pnpm db:generate --name=my_migration # Specify migration name
 *   pnpm db:generate --help           # Show help
 */

import { parseArgs } from 'util';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = join(__dirname, '..');

type DatabaseType = 'sqlite' | 'postgresql' | 'mysql' | 'all';

interface GenerateOptions {
  type: DatabaseType;
  name?: string;
}

function printHelp(): void {
  console.log(`
Migration Generation for Trace-Dock
====================================

This script generates Drizzle migrations for your database schemas.

Usage:
  pnpm db:generate [options]

Options:
  --type=<type>     Database type: sqlite, postgresql, mysql, or all
                    (default: all)
  --name=<name>     Migration name (optional, auto-generated if not provided)
  --help            Show this help message

Examples:
  # Generate migrations for all database types
  pnpm db:generate

  # Generate migrations for SQLite only
  pnpm db:generate --type=sqlite

  # Generate migrations with a specific name
  pnpm db:generate --name=add_user_table

  # Generate for PostgreSQL with name
  pnpm db:generate --type=postgresql --name=add_indexes
`);
}

function parseOptions(): GenerateOptions | null {
  try {
    const { values } = parseArgs({
      options: {
        type: { type: 'string', short: 't' },
        name: { type: 'string', short: 'n' },
        help: { type: 'boolean', short: 'h' },
      },
    });

    if (values.help) {
      printHelp();
      return null;
    }

    const dbType = (values.type || 'all') as DatabaseType;
    
    if (!['sqlite', 'postgresql', 'mysql', 'all'].includes(dbType)) {
      console.error(`Error: Invalid database type "${dbType}"`);
      console.error('Valid types: sqlite, postgresql, mysql, all');
      process.exit(1);
    }

    return {
      type: dbType,
      name: values.name,
    };
  } catch (error) {
    console.error('Error parsing arguments:', error);
    printHelp();
    process.exit(1);
  }
}

function runDrizzleGenerate(configFile: string, name?: string): void {
  const args = ['drizzle-kit', 'generate', `--config=${configFile}`];
  if (name) {
    args.push(`--name=${name}`);
  }

  const cmd = `npx ${args.join(' ')}`;
  console.log(`Running: ${cmd}`);

  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: serverDir,
    });
  } catch (error) {
    throw new Error(`drizzle-kit generate failed for ${configFile}`);
  }
}

function generateForType(type: 'sqlite' | 'postgresql' | 'mysql', name?: string): void {
  const configFiles: Record<string, string> = {
    sqlite: 'drizzle.config.sqlite.ts',
    postgresql: 'drizzle.config.pg.ts',
    mysql: 'drizzle.config.mysql.ts',
  };

  const configFile = configFiles[type];
  console.log(`\n📦 Generating migrations for ${type.toUpperCase()}...`);
  console.log(`   Config: ${configFile}`);

  try {
    runDrizzleGenerate(configFile, name);
    console.log(`✅ ${type.toUpperCase()} migrations generated successfully!`);
  } catch (error) {
    console.error(`❌ Failed to generate ${type} migrations:`, error);
    throw error;
  }
}

function main(): void {
  console.log('Trace-Dock Migration Generator\n');
  
  const options = parseOptions();
  if (!options) {
    return; // Help was printed
  }

  const types: ('sqlite' | 'postgresql' | 'mysql')[] = 
    options.type === 'all' 
      ? ['sqlite', 'postgresql', 'mysql']
      : [options.type as 'sqlite' | 'postgresql' | 'mysql'];

  let hasErrors = false;

  for (const type of types) {
    try {
      generateForType(type, options.name);
    } catch {
      hasErrors = true;
      // Continue with other types even if one fails
    }
  }

  console.log('\n' + '='.repeat(50));
  
  if (hasErrors) {
    console.log('⚠️  Some migrations failed to generate.');
    console.log('   Check the errors above and ensure your schema files are valid.');
    process.exit(1);
  } else {
    console.log('✅ All migrations generated successfully!');
    console.log('\nNext steps:');
    console.log('  1. Review the generated migrations in ./drizzle/<db-type>/');
    console.log('  2. Run "pnpm db:migrate" to apply migrations');
    console.log('  3. Or run "pnpm db:setup" to setup a fresh database');
  }
}

main();
