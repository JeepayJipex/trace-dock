# @trace-dock/sdk

A universal JavaScript/TypeScript logging SDK with HTTP and WebSocket transport. Works in Node.js, browsers, and Tauri applications.

## Features

- 🚀 **Universal** - Works in Node.js, browsers, and Tauri
- 📡 **Dual Transport** - HTTP and WebSocket support
- 🔍 **Stack Traces** - Automatic stack trace capture for errors
- 🏷️ **Structured Logging** - Support for tags and metadata
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
  serverUrl: 'http://localhost:3001',
});

// Basic logging
logger.debug('Debug message');
logger.info('User logged in', { userId: 123 });
logger.warn('Rate limit approaching', { current: 95, max: 100 });
logger.error('Failed to process request', new Error('Connection timeout'));
```

## Configuration

```typescript
import { createLogger } from '@trace-dock/sdk';

const logger = createLogger({
  // Required
  appName: 'my-app',
  
  // Optional - defaults shown
  serverUrl: 'http://localhost:3001',  // Trace-dock server URL
  transport: 'http',                    // 'http' | 'websocket'
  enabled: true,                        // Enable/disable logging
  captureStackTrace: true,              // Capture stack traces for errors
  defaultTags: ['production'],          // Default tags for all logs
  defaultMeta: { version: '1.0.0' },    // Default metadata for all logs
});
```

## API

### Log Levels

```typescript
logger.debug(message, meta?, tags?);  // Debug level
logger.info(message, meta?, tags?);   // Info level
logger.warn(message, meta?, tags?);   // Warning level
logger.error(message, error?, tags?); // Error level (accepts Error object)
```

### Adding Metadata

```typescript
// As second argument
logger.info('User action', { userId: 123, action: 'click' });

// With tags
logger.info('API call', { endpoint: '/users' }, ['api', 'users']);
```

### Error Logging

```typescript
try {
  await riskyOperation();
} catch (error) {
  // Stack trace is automatically captured
  logger.error('Operation failed', error);
}
```

### WebSocket Transport

For real-time logging with lower latency:

```typescript
const logger = createLogger({
  appName: 'my-app',
  serverUrl: 'ws://localhost:3001',
  transport: 'websocket',
});
```

### Session Management

Each logger instance gets a unique session ID. You can also set it manually:

```typescript
const logger = createLogger({
  appName: 'my-app',
  sessionId: 'user-session-abc123',
});
```

## Environment Detection

The SDK automatically detects the runtime environment:

- **Node.js** - Server-side applications
- **Browser** - Web applications
- **Tauri** - Desktop applications

```typescript
import { getEnvironment } from '@trace-dock/sdk';

const env = getEnvironment();
// { type: 'node' | 'browser' | 'tauri', version?: string }
```

## Disabling in Production

```typescript
const logger = createLogger({
  appName: 'my-app',
  enabled: process.env.NODE_ENV !== 'production',
});
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type { 
  LogLevel, 
  LogEntry, 
  LoggerConfig,
  Transport 
} from '@trace-dock/sdk';
```

## Self-Hosted Server

This SDK is designed to work with [trace-dock](https://github.com/YOUR_USERNAME/trace-dock), a self-hosted logging server with a web UI.

```bash
# Start the trace-dock server
docker-compose up -d
```

## License

MIT
