/**
 * Test script for trace-dock SDK
 * Run with: npx tsx examples/test-sdk.ts
 */
import { createLogger, createTracer } from '../packages/sdk/src/index';

const API_ENDPOINT = 'http://localhost:3001/ingest';

const logger = createLogger({
  endpoint: API_ENDPOINT,
  appName: 'test-app',
  debug: true,
});

const tracer = createTracer({
  endpoint: API_ENDPOINT,
  appName: 'test-app',
  debug: true,
});

// Utility function to simulate async delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Random utilities
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

console.log('🚀 Starting trace-dock SDK test...\n');

// ============================================
// Test 1: Basic Log Levels
// ============================================
async function testBasicLogs() {
  console.log('📝 [Test 1] Sending basic logs...');
  
  logger.debug('Debug: Application initialization started', { 
    component: 'test-script',
    version: '1.0.0' 
  });

  logger.info('Info: User logged in successfully', { 
    userId: 42,
    email: 'test@example.com',
    loginMethod: 'oauth'
  });

  logger.warn('Warning: High memory usage detected', { 
    memoryUsage: '85%',
    threshold: '80%',
    pid: process.pid
  });

  logger.info('Info: Configuration loaded', {
    environment: 'development',
    features: ['tracing', 'logging', 'metrics'],
  });

  await sleep(100);
}

// ============================================
// Test 2: Various Error Types (for error grouping)
// ============================================
async function testErrorLogs() {
  console.log('\n� [Test 2] Sending varied error logs...');

  // Database errors
  const dbErrors = [
    { error: new Error('Connection refused'), host: 'db-primary.internal', port: 5432, retryCount: 3 },
    { error: new Error('Connection timeout'), host: 'db-replica.internal', port: 5432, timeout: 30000 },
    { error: new Error('Connection refused'), host: 'db-primary.internal', port: 5432, retryCount: 5 },
    { error: new Error('Too many connections'), host: 'db-primary.internal', maxConnections: 100 },
  ];

  for (const dbError of dbErrors) {
    logger.error('Database connection failed', dbError);
    await sleep(50);
  }

  // Authentication errors
  const authErrors = [
    { userId: 101, reason: 'Invalid password', attempts: 3, ip: '192.168.1.100' },
    { userId: 102, reason: 'Account locked', lockDuration: '30m', ip: '10.0.0.55' },
    { userId: 101, reason: 'Invalid password', attempts: 5, ip: '192.168.1.100' },
    { userId: 103, reason: 'Token expired', tokenAge: '2h', ip: '172.16.0.20' },
    { userId: 104, reason: 'Invalid 2FA code', ip: '192.168.1.200' },
  ];

  for (const authError of authErrors) {
    logger.error('Authentication failed', { error: new Error(authError.reason), ...authError });
    await sleep(50);
  }

  // API errors
  const apiErrors = [
    { endpoint: '/api/users', method: 'GET', statusCode: 500, error: new Error('Internal server error') },
    { endpoint: '/api/orders', method: 'POST', statusCode: 400, error: new Error('Validation failed: missing required field "quantity"') },
    { endpoint: '/api/users', method: 'GET', statusCode: 500, error: new Error('Internal server error') },
    { endpoint: '/api/payments', method: 'POST', statusCode: 502, error: new Error('Payment gateway unavailable') },
    { endpoint: '/api/products', method: 'DELETE', statusCode: 403, error: new Error('Forbidden: insufficient permissions') },
    { endpoint: '/api/orders', method: 'POST', statusCode: 400, error: new Error('Validation failed: invalid email format') },
  ];

  for (const apiError of apiErrors) {
    logger.error(`API request failed: ${apiError.endpoint}`, apiError);
    await sleep(50);
  }

  // Runtime errors
  const runtimeErrors = [
    { error: new Error('Cannot read property "id" of undefined'), file: 'user.service.ts', line: 42 },
    { error: new Error('Maximum call stack size exceeded'), file: 'recursive.util.ts', line: 15 },
    { error: new Error('Cannot read property "id" of undefined'), file: 'user.service.ts', line: 42 },
    { error: new TypeError('Expected string but received number'), file: 'validator.ts', line: 88 },
    { error: new RangeError('Array index out of bounds'), file: 'data.processor.ts', line: 156 },
  ];

  for (const runtimeError of runtimeErrors) {
    logger.error('Runtime exception', runtimeError);
    await sleep(50);
  }

  // External service errors
  const externalErrors = [
    { service: 'stripe', operation: 'charge', error: new Error('Card declined'), cardLast4: '4242' },
    { service: 'sendgrid', operation: 'send_email', error: new Error('Rate limit exceeded'), retryAfter: 60 },
    { service: 'aws-s3', operation: 'upload', error: new Error('Access denied'), bucket: 'my-bucket' },
    { service: 'stripe', operation: 'charge', error: new Error('Card declined'), cardLast4: '1234' },
    { service: 'twilio', operation: 'send_sms', error: new Error('Invalid phone number'), phone: '+1555...' },
  ];

  for (const extError of externalErrors) {
    logger.error(`External service error: ${extError.service}`, extError);
    await sleep(50);
  }
}

// ============================================
// Test 3: HTTP Request Trace
// ============================================
async function testHttpRequestTrace() {
  console.log('\n🔗 [Test 3] Creating HTTP request trace...');
  
  await tracer.withTrace('HTTP GET /api/users/42', async () => {
    // Middleware span
    await tracer.withSpan('middleware.auth', async () => {
      await sleep(randomInt(5, 15));
      tracer.log('info', 'User authenticated', { userId: 42 });
    }, { operationType: 'middleware' });

    // Validation span
    await tracer.withSpan('validation.params', async () => {
      await sleep(randomInt(2, 8));
    }, { operationType: 'validation' });

    // Database query span
    const user = await tracer.withSpan('db.query.users', async () => {
      await sleep(randomInt(20, 80));
      tracer.log('debug', 'Executing SQL: SELECT * FROM users WHERE id = ?', { params: [42] });
      return { id: 42, name: 'John Doe', email: 'john@example.com' };
    }, { operationType: 'db', metadata: { query: 'SELECT', table: 'users' } });

    // Cache write span
    await tracer.withSpan('cache.set', async () => {
      await sleep(randomInt(3, 10));
      tracer.log('debug', 'Caching user data', { key: 'user:42', ttl: 3600 });
    }, { operationType: 'cache' });

    // Response serialization
    await tracer.withSpan('serialization.json', async () => {
      await sleep(randomInt(1, 5));
    }, { operationType: 'serialization' });

    return user;
  }, { method: 'GET', path: '/api/users/42', clientIp: '192.168.1.100' });
}

// ============================================
// Test 4: E-commerce Order Processing Trace
// ============================================
async function testOrderProcessingTrace() {
  console.log('\n🛒 [Test 4] Creating order processing trace...');

  await tracer.withTrace('process-order', async () => {
    const orderId = `ORD-${Date.now()}`;
    tracer.log('info', 'Starting order processing', { orderId });

    // Validate order
    await tracer.withSpan('validate-order', async () => {
      await sleep(randomInt(10, 30));
      tracer.log('debug', 'Order validation passed');
    }, { operationType: 'validation' });

    // Check inventory
    const inventory = await tracer.withSpan('check-inventory', async () => {
      // Nested database queries
      await tracer.withSpan('db.query.products', async () => {
        await sleep(randomInt(15, 40));
      }, { operationType: 'db' });

      await tracer.withSpan('db.query.warehouse', async () => {
        await sleep(randomInt(10, 25));
      }, { operationType: 'db' });

      return { available: true, quantity: 5 };
    }, { operationType: 'inventory' });

    tracer.log('info', 'Inventory check completed', { ...inventory });

    // Reserve inventory
    await tracer.withSpan('reserve-inventory', async () => {
      await tracer.withSpan('db.transaction.begin', async () => {
        await sleep(randomInt(5, 10));
      }, { operationType: 'db' });

      await tracer.withSpan('db.update.inventory', async () => {
        await sleep(randomInt(20, 50));
      }, { operationType: 'db' });

      await tracer.withSpan('db.transaction.commit', async () => {
        await sleep(randomInt(5, 15));
      }, { operationType: 'db' });
    }, { operationType: 'inventory' });

    // Process payment
    const payment = await tracer.withSpan('process-payment', async () => {
      tracer.log('info', 'Initiating payment', { amount: 99.99, currency: 'USD' });

      // Call payment gateway
      await tracer.withSpan('http.stripe.charges.create', async () => {
        await sleep(randomInt(100, 300));
      }, { operationType: 'http', metadata: { service: 'stripe' } });

      return { success: true, transactionId: `txn_${Date.now()}` };
    }, { operationType: 'payment' });

    tracer.log('info', 'Payment processed', { transactionId: payment.transactionId });

    // Send confirmation email
    await tracer.withSpan('send-confirmation', async () => {
      await tracer.withSpan('template.render', async () => {
        await sleep(randomInt(10, 30));
      }, { operationType: 'template' });

      await tracer.withSpan('http.sendgrid.send', async () => {
        await sleep(randomInt(50, 150));
      }, { operationType: 'http', metadata: { service: 'sendgrid' } });

      tracer.log('info', 'Confirmation email sent');
    }, { operationType: 'email' });

    // Update order status
    await tracer.withSpan('db.update.order_status', async () => {
      await sleep(randomInt(15, 35));
    }, { operationType: 'db' });

    tracer.log('info', 'Order processing completed', { orderId, status: 'completed' });

  }, { source: 'web', customerType: 'premium' });
}

// ============================================
// Test 5: Data Pipeline Trace with Errors
// ============================================
async function testDataPipelineTrace() {
  console.log('\n📊 [Test 5] Creating data pipeline trace (with partial failure)...');

  try {
    await tracer.withTrace('data-pipeline-batch', async () => {
      tracer.log('info', 'Starting data pipeline', { batchSize: 1000 });

      // Extract data
      await tracer.withSpan('extract', async () => {
        await tracer.withSpan('db.query.source', async () => {
          await sleep(randomInt(50, 100));
          tracer.log('debug', 'Fetched 1000 records from source');
        }, { operationType: 'db' });

        await tracer.withSpan('s3.download.supplementary', async () => {
          await sleep(randomInt(30, 80));
        }, { operationType: 'http' });
      }, { operationType: 'etl' });

      // Transform data
      await tracer.withSpan('transform', async () => {
        await tracer.withSpan('parse.json', async () => {
          await sleep(randomInt(20, 50));
        }, { operationType: 'compute' });

        await tracer.withSpan('validate.schema', async () => {
          await sleep(randomInt(30, 60));
          tracer.log('warn', 'Schema validation warnings', { invalidRecords: 12 });
        }, { operationType: 'validation' });

        await tracer.withSpan('enrich.external', async () => {
          // Simulate external API call that fails
          await sleep(randomInt(100, 200));
          throw new Error('External enrichment API rate limited');
        }, { operationType: 'http' });
      }, { operationType: 'etl' });

    }, { pipelineId: 'daily-sync', environment: 'production' });
  } catch (error) {
    logger.error('Data pipeline failed', { 
      error: error instanceof Error ? error : new Error(String(error)),
      pipelineId: 'daily-sync' 
    });
  }
}

// ============================================
// Test 6: Microservice Communication Trace
// ============================================
async function testMicroserviceTrace() {
  console.log('\n🔀 [Test 6] Creating microservice communication trace...');

  await tracer.withTrace('user-registration-flow', async () => {
    tracer.log('info', 'Starting user registration');

    // API Gateway
    await tracer.withSpan('api-gateway.route', async () => {
      await sleep(randomInt(5, 15));

      // Auth service
      await tracer.withSpan('http.auth-service.validate-token', async () => {
        await sleep(randomInt(20, 50));
        tracer.log('debug', 'Token validated');
      }, { operationType: 'http', metadata: { service: 'auth-service' } });

      // User service
      await tracer.withSpan('http.user-service.create', async () => {
        // Database operations in user service
        await tracer.withSpan('user-service.db.check-exists', async () => {
          await sleep(randomInt(15, 35));
        }, { operationType: 'db' });

        await tracer.withSpan('user-service.db.insert', async () => {
          await sleep(randomInt(20, 45));
        }, { operationType: 'db' });

        await tracer.withSpan('user-service.cache.invalidate', async () => {
          await sleep(randomInt(5, 15));
        }, { operationType: 'cache' });

        tracer.log('info', 'User created', { userId: 12345 });
      }, { operationType: 'http', metadata: { service: 'user-service' } });

      // Notification service (async via queue)
      await tracer.withSpan('queue.publish.welcome-email', async () => {
        await sleep(randomInt(10, 25));
        tracer.log('debug', 'Welcome email job queued');
      }, { operationType: 'queue', metadata: { queue: 'notifications' } });

      // Analytics service
      await tracer.withSpan('http.analytics-service.track', async () => {
        await sleep(randomInt(15, 40));
      }, { operationType: 'http', metadata: { service: 'analytics-service' } });

    }, { operationType: 'gateway' });

    tracer.log('info', 'User registration completed');
  }, { source: 'mobile-app', platform: 'ios' });
}

// ============================================
// Test 7: Background Job Trace
// ============================================
async function testBackgroundJobTrace() {
  console.log('\n⏰ [Test 7] Creating background job trace...');

  await tracer.withTrace('scheduled-cleanup-job', async () => {
    tracer.log('info', 'Starting scheduled cleanup job');

    // Cleanup old sessions
    await tracer.withSpan('cleanup.sessions', async () => {
      await tracer.withSpan('db.delete.expired_sessions', async () => {
        await sleep(randomInt(50, 150));
      }, { operationType: 'db' });
      tracer.log('info', 'Cleaned up expired sessions', { deletedCount: 342 });
    }, { operationType: 'maintenance' });

    // Cleanup old logs
    await tracer.withSpan('cleanup.logs', async () => {
      await tracer.withSpan('db.delete.old_logs', async () => {
        await sleep(randomInt(100, 300));
      }, { operationType: 'db' });
      tracer.log('info', 'Cleaned up old logs', { deletedCount: 15420 });
    }, { operationType: 'maintenance' });

    // Optimize database
    await tracer.withSpan('optimize.database', async () => {
      await tracer.withSpan('db.vacuum', async () => {
        await sleep(randomInt(200, 500));
      }, { operationType: 'db' });

      await tracer.withSpan('db.analyze', async () => {
        await sleep(randomInt(100, 200));
      }, { operationType: 'db' });

      tracer.log('info', 'Database optimization completed');
    }, { operationType: 'maintenance' });

    // Send report
    await tracer.withSpan('report.send', async () => {
      await tracer.withSpan('report.generate', async () => {
        await sleep(randomInt(30, 80));
      }, { operationType: 'compute' });

      await tracer.withSpan('http.slack.webhook', async () => {
        await sleep(randomInt(50, 100));
      }, { operationType: 'http', metadata: { service: 'slack' } });

      tracer.log('info', 'Cleanup report sent to Slack');
    }, { operationType: 'notification' });

    tracer.log('info', 'Cleanup job completed');
  }, { jobType: 'scheduled', schedule: '0 3 * * *' });
}

// ============================================
// Test 8: GraphQL Query Trace
// ============================================
async function testGraphQLTrace() {
  console.log('\n🔮 [Test 8] Creating GraphQL query trace...');

  await tracer.withTrace('graphql.query.getUserProfile', async () => {
    // Parse query
    await tracer.withSpan('graphql.parse', async () => {
      await sleep(randomInt(2, 8));
    }, { operationType: 'graphql' });

    // Validate query
    await tracer.withSpan('graphql.validate', async () => {
      await sleep(randomInt(3, 10));
    }, { operationType: 'graphql' });

    // Execute resolvers
    await tracer.withSpan('graphql.execute', async () => {
      // User resolver
      await tracer.withSpan('resolver.user', async () => {
        await tracer.withSpan('dataloader.user.load', async () => {
          await sleep(randomInt(15, 40));
        }, { operationType: 'dataloader' });
      }, { operationType: 'resolver' });

      // Posts resolver (nested)
      await tracer.withSpan('resolver.user.posts', async () => {
        await tracer.withSpan('dataloader.posts.loadMany', async () => {
          await sleep(randomInt(20, 50));
        }, { operationType: 'dataloader' });
      }, { operationType: 'resolver' });

      // Comments resolver (nested)
      await tracer.withSpan('resolver.posts.comments', async () => {
        await tracer.withSpan('dataloader.comments.loadMany', async () => {
          await sleep(randomInt(25, 60));
        }, { operationType: 'dataloader' });
      }, { operationType: 'resolver' });

      // Likes count resolver
      await tracer.withSpan('resolver.posts.likesCount', async () => {
        await tracer.withSpan('cache.get.likes', async () => {
          await sleep(randomInt(5, 15));
        }, { operationType: 'cache' });
      }, { operationType: 'resolver' });

    }, { operationType: 'graphql' });

    // Format response
    await tracer.withSpan('graphql.formatResponse', async () => {
      await sleep(randomInt(2, 8));
    }, { operationType: 'graphql' });

    tracer.log('info', 'GraphQL query executed successfully', { 
      operationName: 'getUserProfile',
      complexity: 12 
    });
  }, { operationType: 'query', clientVersion: '2.1.0' });
}

// ============================================
// Main execution
// ============================================
async function main() {
  try {
    await testBasicLogs();
    await testErrorLogs();
    await testHttpRequestTrace();
    await testOrderProcessingTrace();
    await testDataPipelineTrace();
    await testMicroserviceTrace();
    await testBackgroundJobTrace();
    await testGraphQLTrace();

    // Wait for all async operations to complete
    await sleep(500);

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed!');
    console.log('='.repeat(50));
    console.log('\n📺 Check the UI at http://localhost:5173 to see:');
    console.log('   • Logs page: Various log levels and error types');
    console.log('   • Errors page: Grouped errors with fingerprinting');
    console.log('   • Traces page: Multiple traces with nested spans');
    console.log('   • Settings page: Configure retention and cleanup\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
