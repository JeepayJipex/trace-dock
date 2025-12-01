/**
 * Test script for trace-dock SDK
 * Run with: npx tsx examples/test-sdk.ts
 */
import { createLogger } from '../packages/sdk/src/index';

const logger = createLogger({
  endpoint: 'http://localhost:3001/ingest',
  appName: 'test-app',
  debug: true, // Also log to console
});

console.log('🚀 Sending test logs to trace-dock...\n');

// Test all log levels
logger.debug('This is a debug message', { 
  component: 'test-script',
  iteration: 1 
});

logger.info('User logged in successfully', { 
  userId: 42,
  email: 'test@example.com',
  loginMethod: 'oauth'
});

logger.warn('High memory usage detected', { 
  memoryUsage: '85%',
  threshold: '80%',
  pid: process.pid
});

logger.error('Database connection failed', { 
  error: new Error('Connection refused'),
  host: 'localhost',
  port: 5432,
  retryCount: 3
});

// Simulate some async activity
setTimeout(() => {
  logger.info('Async operation completed', {
    duration: '150ms',
    success: true
  });
  
  console.log('\n✅ All test logs sent!');
  console.log('📺 Check the UI at http://localhost:5173 to see them.');
}, 500);
