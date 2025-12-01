# @trace-dock/sdk

A universal JavaScript/TypeScript logging SDK for trace-dock. Works in Node.js, browsers, and Tauri applications.

## Features

- 🚀 **Universal** - Works in Node.js, browsers, and Tauri
- 📡 **Dual Transport** - HTTP with optional WebSocket for real-time streaming
- 🔍 **Stack Traces** - Automatic stack trace capture for errors and warnings
- 🏷️ **Structured Logging** - Support for metadata and context
- 👶 **Child Loggers** - Create child loggers with inherited context
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
  LogLevel, 
  LogEntry, 
  LoggerConfig,
  EnvironmentInfo,
  TransportOptions 
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
