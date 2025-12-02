# @trace-dock/sdk

A universal JavaScript/TypeScript logging and tracing SDK for trace-dock. Works in Node.js, browsers, and Tauri applications.

## Features

- 🚀 **Universal** - Works in Node.js, browsers, and Tauri
- 📡 **Dual Transport** - HTTP with optional WebSocket for real-time streaming
- 🔍 **Stack Traces** - Automatic stack trace capture for errors and warnings
- 🏷️ **Structured Logging** - Support for metadata and context
- 👶 **Child Loggers** - Create child loggers with inherited context
- 🔗 **Distributed Tracing** - Full tracing support with spans and waterfall visualization
- ⚡ **Lightweight** - Zero dependencies, tree-shakeable
- 📦 **TypeScript** - Full TypeScript support with type definitions

## Installation

```bash
# npm
npm install @trace-dock/sdk

# pnpm
pnpm add @trace-dock/sdk

# yarn
yarn add @trace-dock/sdk
```

## Quick Start

```typescript
import { createLogger } from '@trace-dock/sdk';

const logger = createLogger({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
});

// Basic logging
logger.debug('Debug message');
logger.info('User logged in', { userId: 123 });
logger.warn('Rate limit approaching', { current: 95, max: 100 });
logger.error('Failed to process request', { error: new Error('Connection timeout') });
```

## Configuration

```typescript
import { createLogger } from '@trace-dock/sdk';

const logger = createLogger({
  // Required
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  
  // Optional - defaults shown
  enabled: true,                  // Enable/disable logging (default: true)
  sessionId: undefined,           // Auto-generated if not provided
  enableWebSocket: false,         // Enable WebSocket for real-time streaming
  wsEndpoint: undefined,          // Auto-derived from endpoint if not set
  batchSize: 10,                  // Batch size for HTTP transport
  flushInterval: 5000,            // Flush interval in ms
  maxRetries: 3,                  // Max retries for failed requests
  debug: false,                   // Log to console as well
  metadata: {},                   // Default metadata for all logs
  onError: undefined,             // Error callback
});
```

## API

### Log Levels

```typescript
logger.debug(message, metadata?);  // Debug level
logger.info(message, metadata?);   // Info level
logger.warn(message, metadata?);   // Warning level (includes stack trace)
logger.error(message, metadata?);  // Error level (includes stack trace)
```

### Adding Metadata

```typescript
// Pass metadata as second argument
logger.info('User action', { userId: 123, action: 'click' });

// For errors, pass the Error object in metadata
logger.error('Operation failed', { 
  error: new Error('Connection timeout'),
  endpoint: '/api/users'
});
```

### Child Loggers

Create child loggers that inherit parent context:

```typescript
const logger = createLogger({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
});

// Create a child logger with additional context
const userLogger = logger.child({ userId: 123, role: 'admin' });

// All logs from userLogger will include userId and role
userLogger.info('User performed action'); // metadata includes { userId: 123, role: 'admin' }
```

### WebSocket Transport

Enable WebSocket for real-time log streaming to the trace-dock UI:

```typescript
const logger = createLogger({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  enableWebSocket: true,
  // wsEndpoint is auto-derived: ws://localhost:3001/live
});

// Don't forget to disconnect when done
logger.disconnect();
```

### Session Management

Each logger instance gets a unique session ID. You can also set it manually:

```typescript
const logger = createLogger({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  sessionId: 'user-session-abc123',
});

// Get current session ID
const sessionId = logger.getSessionId();

// Update session ID
logger.setSessionId('new-session-id');
```

### Debug Mode

Enable debug mode to also log to the console:

```typescript
const logger = createLogger({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  debug: true, // Logs will also appear in console
});
```

### Enable/Disable Logging

You can enable or disable the SDK at runtime to control when logs are sent:

```typescript
const logger = createLogger({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  enabled: true, // Default: true
});

// Check if logging is enabled
logger.isEnabled(); // true

// Disable logging (no network requests will be made)
logger.disable();
logger.info('This will NOT be sent');

// Re-enable logging
logger.enable();
logger.info('This WILL be sent');

// In debug mode, logs still appear in console even when disabled
const debugLogger = createLogger({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  enabled: false,
  debug: true, // Still logs to console
});
```

## Tracing

The SDK includes a full-featured Tracer for distributed tracing, allowing you to track requests across services with a waterfall timeline visualization.

### Basic Tracing

```typescript
import { createTracer } from '@trace-dock/sdk';

const tracer = createTracer({
  appName: 'my-api',
  endpoint: 'http://localhost:3001/ingest',
});

// Start a trace
const traceId = tracer.startTrace('HTTP GET /users');

// Create spans for operations
const spanId = tracer.startSpan('db.query', {
  operationType: 'query',
  metadata: { table: 'users' },
});

// ... perform the operation ...

// End the span
tracer.endSpan(spanId, 'completed');

// End the trace
tracer.endTrace(traceId, 'completed');
```

### Using withTrace and withSpan

For cleaner code, use the wrapper functions that automatically handle errors:

```typescript
// Wrap an entire operation in a trace
const result = await tracer.withTrace('process-order', async () => {
  
  // Wrap sub-operations in spans
  const user = await tracer.withSpan('fetch-user', async () => {
    return await db.users.findById(userId);
  }, { operationType: 'db' });
  
  const payment = await tracer.withSpan('process-payment', async () => {
    return await paymentService.charge(user, amount);
  }, { operationType: 'http' });
  
  return { user, payment };
});
```

### Nested Spans

Spans automatically nest based on the current context:

```typescript
tracer.startTrace('api-request');

const dbSpan = tracer.startSpan('db.transaction');
  
  const querySpan = tracer.startSpan('db.query.users'); // Parent: dbSpan
  tracer.endSpan(querySpan, 'completed');
  
  const insertSpan = tracer.startSpan('db.insert.order'); // Parent: dbSpan
  tracer.endSpan(insertSpan, 'completed');

tracer.endSpan(dbSpan, 'completed');

tracer.endTrace(tracer.getCurrentTraceId()!, 'completed');
```

### Logging Within Traces

Log messages within the trace context:

```typescript
tracer.startTrace('user-registration');

tracer.log('info', 'Starting user registration', { email: user.email });

const spanId = tracer.startSpan('send-email');
tracer.log('debug', 'Sending welcome email');
tracer.endSpan(spanId, 'completed');

tracer.log('info', 'User registration complete');
tracer.endTrace(tracer.getCurrentTraceId()!, 'completed');
```

### Tracer Configuration

```typescript
const tracer = createTracer({
  // Required
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  
  // Optional
  sessionId: undefined,        // Auto-generated if not provided
  enabled: true,               // Global enable/disable (default: true)
  enableTracing: true,         // Enable traces/spans (default: true)
  debug: false,                // Log to console as well
  metadata: {},                // Default metadata for all traces
  spanTimeout: 300000,         // Auto-end spans after 5 minutes (ms)
  onError: undefined,          // Error callback
});
```

### Enable/Disable Tracing

The Tracer supports granular control over what gets sent:

```typescript
const tracer = createTracer({
  appName: 'my-app',
  endpoint: 'http://localhost:3001/ingest',
  enabled: true,        // Global enable (default: true)
  enableTracing: true,  // Enable traces/spans (default: true)
});

// ---- Global Enable/Disable ----

// Check if tracer is globally enabled
tracer.isEnabled(); // true

// Disable everything (no logs, no traces, no spans)
tracer.disable();

// Re-enable everything
tracer.enable();

// ---- Tracing-Specific Control ----

// Check if tracing is enabled
tracer.isTracingEnabled(); // true

// Disable only tracing (logs via tracer.log() still work)
tracer.disableTracing();

// Now traces and spans won't be sent
tracer.startTrace('test'); // Returns a dummy ID, nothing sent
tracer.log('info', 'This IS still sent'); // Logs still work!

// Re-enable tracing
tracer.enableTracing();
```

This is useful for:
- **Development vs Production**: Disable in dev, enable in prod
- **Feature flags**: Toggle tracing based on user settings
- **Performance**: Disable detailed tracing under high load
- **Debugging**: Enable only logs, disable trace overhead

### Tracer API Reference

```typescript
// Trace management
tracer.startTrace(name, metadata?): string           // Returns trace ID
tracer.startTrace(name, options?): string            // Options: { traceId?, parentSpanId?, metadata? }
tracer.endTrace(traceId, status): void               // Status: 'completed' | 'error'

// Span management
tracer.startSpan(name, options?): string             // Returns span ID
tracer.endSpan(spanId, status, metadata?): void

// Wrapper functions (recommended)
tracer.withTrace<T>(name, fn, metadata?): Promise<T>
tracer.withSpan<T>(name, fn, options?): Promise<T>

// Context
tracer.getCurrentTraceId(): string | null
tracer.getCurrentSpanId(): string | null
tracer.getTraceContext(): { traceId, spanId, sessionId } | null  // For distributed tracing

// Logging within trace context
tracer.log(level, message, metadata?): void

// Session
tracer.getSessionId(): string
tracer.setSessionId(sessionId): void

// Enable/Disable
tracer.isEnabled(): boolean                          // Check global enabled state
tracer.enable(): void                                // Enable globally
tracer.disable(): void                               // Disable globally
tracer.isTracingEnabled(): boolean                   // Check if tracing is enabled
tracer.enableTracing(): void                         // Enable traces/spans
tracer.disableTracing(): void                        // Disable traces/spans (logs still work)
```

### Integration Example: Express Middleware

```typescript
import express from 'express';
import { createTracer } from '@trace-dock/sdk';

const app = express();
const tracer = createTracer({
  appName: 'express-api',
  endpoint: 'http://localhost:3001/ingest',
});

// Tracing middleware
app.use((req, res, next) => {
  const traceId = tracer.startTrace(`${req.method} ${req.path}`, {
    url: req.url,
    method: req.method,
    userAgent: req.headers['user-agent'],
  });
  
  req.traceId = traceId;
  req.tracer = tracer;
  
  res.on('finish', () => {
    tracer.endTrace(traceId, res.statusCode >= 400 ? 'error' : 'completed');
  });
  
  next();
});

// Route with tracing
app.get('/users/:id', async (req, res) => {
  const user = await req.tracer.withSpan('db.findUser', async () => {
    return await db.users.findById(req.params.id);
  }, { operationType: 'db' });
  
  res.json(user);
});
```

### Distributed Tracing (Multi-Service)

The SDK supports distributed tracing across multiple services. You can propagate trace context via HTTP headers to continue a trace in another service.

#### Service A (Caller)

```typescript
import { createTracer } from '@trace-dock/sdk';

const tracer = createTracer({
  appName: 'service-a',
  endpoint: 'http://localhost:3001/ingest',
});

async function callServiceB() {
  tracer.startTrace('process-order');
  
  // Get the trace context to propagate
  const context = tracer.getTraceContext();
  
  // Call Service B with trace context in headers
  const response = await fetch('http://service-b/api/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-trace-id': context?.traceId || '',
      'x-span-id': context?.spanId || '',
    },
    body: JSON.stringify({ orderId: 123 }),
  });
  
  tracer.endTrace(context!.traceId, 'completed');
}
```

#### Service B (Receiver)

```typescript
import express from 'express';
import { createTracer } from '@trace-dock/sdk';

const app = express();
const tracer = createTracer({
  appName: 'service-b',
  endpoint: 'http://localhost:3001/ingest',
});

app.post('/api/process', async (req, res) => {
  // Extract trace context from headers
  const traceId = req.headers['x-trace-id'] as string;
  const parentSpanId = req.headers['x-span-id'] as string;
  
  // Continue the trace from Service A
  tracer.startTrace('service-b-handler', {
    traceId,              // Use the same trace ID
    parentSpanId,         // Link to the calling span
    metadata: { receivedFrom: 'service-a' },
  });
  
  // Your spans will be linked to the parent trace
  await tracer.withSpan('process-order', async () => {
    // ... do work ...
  });
  
  tracer.endTrace(traceId, 'completed');
  res.json({ success: true });
});
```

#### Trace Context API

```typescript
// Get current trace context for propagation
const context = tracer.getTraceContext();
// Returns: { traceId: string, spanId: string | null, sessionId: string } | null

// Start a trace with an existing trace ID (for distributed tracing)
tracer.startTrace('operation-name', {
  traceId: 'existing-trace-id',      // Continue this trace
  parentSpanId: 'parent-span-id',    // Link to parent span from caller
  metadata: { ... },                  // Additional metadata
});
```

This enables you to:
- **Track requests across services** - See the full journey of a request
- **Visualize service dependencies** - Understand how services interact
- **Debug distributed systems** - Find where issues occur in the chain

## Environment Detection

The SDK automatically detects the runtime environment and includes it in logs:

- **Node.js** - Includes Node version, platform, architecture
- **Browser** - Includes user agent, current URL
- **Tauri** - Includes Tauri version

```typescript
import { detectEnvironment } from '@trace-dock/sdk';

const env = detectEnvironment();
// { type: 'node' | 'browser' | 'tauri' | 'unknown', ... }
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type { 
  // Logger types
  LogLevel, 
  LogEntry, 
  LoggerConfig,
  EnvironmentInfo,
  TransportOptions,
  
  // Tracer types
  TracerConfig,
  Trace,
  Span,
  TraceStatus,
} from '@trace-dock/sdk';
```

## Self-Hosted Server

This SDK is designed to work with [trace-dock](https://github.com/JeepayJipex/trace-dock), a self-hosted logging server with a web UI.

```bash
# Clone the repository
git clone https://github.com/JeepayJipex/trace-dock.git
cd trace-dock

# Start with Docker
docker-compose up -d

# Or run in development
pnpm install
pnpm dev
```

## License

MIT
