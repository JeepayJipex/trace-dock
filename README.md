# 🚀 Trace Dock

A complete logging and tracing solution with SDK, server, and web UI for real-time monitoring. Similar to Datadog, but self-hosted.

![Trace Dock](./images/trace-dock-example.png)

## ✨ Features

- **📦 SDK** - JavaScript/TypeScript logger and tracer for Node.js, Browser, and Tauri
- **🔌 Server** - High-performance API with WebSocket real-time streaming
- **🖥️ Web UI** - Beautiful dark-themed dashboard with live updates
- **� Swagger UI** - Interactive API documentation with OpenAPI 3.0 spec
- **�🚨 Error Tracking** - Automatic error grouping with fingerprinting (like Sentry)
- **🔗 Distributed Tracing** - Full tracing support with waterfall visualization (like Datadog APM)
- **🗓️ Data Retention** - Configurable retention periods with automatic cleanup
- **🐳 Docker** - One-command deployment with Docker Compose

## 📁 Project Structure

```
/trace-dock
├── packages/
│   └── sdk/          # TypeScript SDK for logging
├── server/           # Hono API server with WebSocket
├── web/              # Vue 3 + Vite web interface
├── docker-compose.yml
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/JeepayJipex/trace-dock.git
cd trace-dock

# Install dependencies
pnpm install
```

### Development

```bash
# Start both server and web UI
pnpm dev

# Or start individually
pnpm dev:server  # Server on http://localhost:3000
pnpm dev:web     # Web UI on http://localhost:5173
```

### Docker Deployment

```bash
# Build and start all services
pnpm docker:up

# Or using docker-compose directly
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
pnpm docker:down
```

Access the application:
- **Web UI**: http://localhost:8080
- **API**: http://localhost:3000
- **Swagger UI**: http://localhost:3000/ui
- **OpenAPI Spec**: http://localhost:3000/doc
- **WebSocket**: ws://localhost:3000/live

## 📦 SDK Usage

### Installation

```bash
npm install @trace-dock/sdk
# or
pnpm add @trace-dock/sdk
# or
yarn add @trace-dock/sdk
```

### Basic Usage

```typescript
import { createLogger } from '@trace-dock/sdk';

const logger = createLogger({
  endpoint: 'http://localhost:3000/ingest',
  appName: 'my-app',
});

// Log messages
logger.debug('Debug message', { extra: 'data' });
logger.info('User logged in', { userId: 123 });
logger.warn('High memory usage', { usage: '85%' });
logger.error('Database connection failed', { error: new Error('Connection refused') });
```

### Tracing

```typescript
import { createTracer } from '@trace-dock/sdk';

const tracer = createTracer({
  endpoint: 'http://localhost:3000/ingest',
  appName: 'my-app',
});

// Trace an entire operation
const result = await tracer.withTrace('process-order', async () => {
  
  // Track sub-operations with spans
  const user = await tracer.withSpan('fetch-user', async () => {
    return await db.users.findById(userId);
  }, { operationType: 'db' });
  
  const payment = await tracer.withSpan('charge-payment', async () => {
    return await stripe.charges.create({ amount, customer: user.stripeId });
  }, { operationType: 'http' });
  
  return { user, payment };
});
```

### Configuration Options

```typescript
const logger = createLogger({
  // Required
  endpoint: 'http://localhost:3000/ingest',
  appName: 'my-app',
  
  // Optional
  sessionId: 'custom-session-id',      // Auto-generated if not provided
  enableWebSocket: true,                // Enable real-time streaming
  wsEndpoint: 'ws://localhost:3000/live',
  batchSize: 10,                        // Batch logs before sending
  flushInterval: 5000,                  // Flush interval in ms
  maxRetries: 3,                        // Max retry attempts
  debug: false,                         // Console log in development
  
  // Global metadata added to all logs
  metadata: {
    version: '1.0.0',
    environment: 'production',
  },
  
  // Error handler
  onError: (error) => {
    console.error('Logger error:', error);
  },
});
```

### Tracer Configuration

```typescript
const tracer = createTracer({
  // Required
  endpoint: 'http://localhost:3000/ingest',
  appName: 'my-app',
  
  // Optional
  sessionId: 'custom-session-id',
  debug: false,
  metadata: {},
  spanTimeout: 300000,  // Auto-end spans after 5 minutes
  onError: (error) => console.error('Tracer error:', error),
});
```

### Child Loggers

```typescript
// Create a child logger with additional context
const userLogger = logger.child({
  userId: 123,
  module: 'auth',
});

userLogger.info('User action'); // Includes userId and module
```

### Session Management

```typescript
// Get current session ID
const sessionId = logger.getSessionId();

// Set new session ID (e.g., after user login)
logger.setSessionId('new-session-id');
```

### Browser Usage

```html
<script type="module">
  import { createLogger } from '@trace-dock/sdk';
  
  const logger = createLogger({
    endpoint: '/api/ingest',
    appName: 'web-app',
  });
  
  window.onerror = (message, source, line, col, error) => {
    logger.error('Uncaught error', { message, source, line, col, error });
  };
  
  logger.info('App initialized');
</script>
```

### Node.js Usage

```typescript
import { createLogger } from '@trace-dock/sdk';

const logger = createLogger({
  endpoint: 'http://localhost:3000/ingest',
  appName: 'node-app',
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});

logger.info('Server started', { port: 3000 });
```

### Tauri Usage

```typescript
import { createLogger } from '@trace-dock/sdk';

const logger = createLogger({
  endpoint: 'http://localhost:3000/ingest',
  appName: 'tauri-app',
});

// Tauri environment is auto-detected
logger.info('Tauri app started');
```

## 🔌 API Reference

### API Documentation

Trace Dock provides interactive API documentation via Swagger UI, powered by OpenAPI 3.0.

- **Swagger UI**: http://localhost:3000/ui - Interactive API explorer to test endpoints directly
- **OpenAPI Spec**: http://localhost:3000/doc - Raw OpenAPI 3.0 JSON specification

The Swagger UI allows you to:
- Browse all available endpoints organized by category (Logs, Traces, Error Groups, Settings)
- View request/response schemas with examples
- Test API calls directly from the browser
- Download the OpenAPI spec for code generation

### Server Endpoints

#### `POST /ingest`
Ingest a new log entry.

```bash
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "id": "uuid",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "level": "info",
    "message": "Test log",
    "appName": "test-app",
    "sessionId": "session-123",
    "environment": { "type": "node" }
  }'
```

#### `GET /logs`
Fetch logs with pagination and filtering.

```bash
# Get all logs
curl http://localhost:3000/logs

# With filters
curl "http://localhost:3000/logs?level=error&appName=my-app&limit=100&offset=0"
```

Query Parameters:
- `level` - Filter by log level (debug, info, warn, error)
- `appName` - Filter by application name
- `sessionId` - Filter by session ID
- `search` - Full-text search
- `startDate` - Filter by start date (ISO format)
- `endDate` - Filter by end date (ISO format)
- `limit` - Number of results (default: 50, max: 1000)
- `offset` - Pagination offset

#### `GET /logs/:id`
Get a single log entry by ID.

#### `GET /stats`
Get log statistics.

```json
{
  "total": 1234,
  "byLevel": { "debug": 100, "info": 800, "warn": 200, "error": 134 },
  "byApp": { "my-app": 1000, "other-app": 234 }
}
```

#### `GET /apps`
Get list of unique application names.

#### `GET /sessions`
Get list of session IDs.

### Error Groups API

#### `GET /error-groups`
Get error groups with pagination and filtering.

```bash
curl "http://localhost:3000/error-groups?status=unreviewed&appName=my-app&limit=20"
```

Query Parameters:
- `appName` - Filter by application name
- `status` - Filter by status (unreviewed, reviewed, ignored, resolved)
- `search` - Search in error messages
- `sortBy` - Sort by field (last_seen, first_seen, occurrence_count)
- `sortOrder` - Sort order (asc, desc)
- `limit` - Number of results (default: 20)
- `offset` - Pagination offset

#### `GET /error-groups/stats`
Get error group statistics.

```json
{
  "totalGroups": 42,
  "totalOccurrences": 1234,
  "byStatus": { "unreviewed": 10, "reviewed": 20, "ignored": 5, "resolved": 7 },
  "byApp": { "my-app": 30, "other-app": 12 },
  "recentTrend": [{ "date": "2024-01-01", "count": 15 }]
}
```

#### `GET /error-groups/:id`
Get a single error group by ID.

#### `PATCH /error-groups/:id/status`
Update error group status.

```bash
curl -X PATCH http://localhost:3000/error-groups/uuid/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "resolved" }'
```

#### `GET /error-groups/:id/occurrences`
Get all log occurrences for an error group.

### Traces API

#### `GET /traces`
Get traces with pagination and filtering.

```bash
curl "http://localhost:3000/traces?appName=my-app&status=completed&minDuration=100"
```

Query Parameters:
- `appName` - Filter by application name
- `sessionId` - Filter by session ID
- `status` - Filter by status (running, completed, error)
- `name` - Search by trace name
- `minDuration` - Minimum duration in ms
- `maxDuration` - Maximum duration in ms
- `startDate` - Filter by start date
- `endDate` - Filter by end date
- `limit` - Number of results (default: 20)
- `offset` - Pagination offset

#### `GET /traces/stats`
Get trace statistics.

```json
{
  "totalTraces": 500,
  "avgDurationMs": 245.5,
  "byStatus": { "running": 2, "completed": 480, "error": 18 },
  "byApp": { "my-app": 400, "other-app": 100 },
  "recentTrend": [{ "date": "2024-01-01", "count": 50, "avgDuration": 230 }]
}
```

#### `GET /traces/:id`
Get a single trace with all spans and associated logs.

```json
{
  "trace": { "id": "...", "name": "HTTP GET /users", "durationMs": 245, ... },
  "spans": [
    { "id": "...", "name": "db.query", "durationMs": 45, "parentSpanId": null, ... },
    { "id": "...", "name": "cache.get", "durationMs": 2, "parentSpanId": "...", ... }
  ],
  "logs": [
    { "id": "...", "message": "Fetching users", "traceId": "...", "spanId": "...", ... }
  ]
}
```

#### `POST /traces`
Create a new trace.

```bash
curl -X POST http://localhost:3000/traces \
  -H "Content-Type: application/json" \
  -d '{
    "name": "process-order",
    "appName": "my-app",
    "sessionId": "session-123"
  }'
```

#### `PATCH /traces/:id`
Update a trace (end it or change status).

```bash
curl -X PATCH http://localhost:3000/traces/uuid \
  -H "Content-Type: application/json" \
  -d '{
    "endTime": "2024-01-01T00:01:00.000Z",
    "durationMs": 60000,
    "status": "completed"
  }'
```

#### `POST /spans`
Create a new span within a trace.

```bash
curl -X POST http://localhost:3000/spans \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "trace-uuid",
    "name": "db.query.users",
    "operationType": "db",
    "parentSpanId": "parent-span-uuid"
  }'
```

#### `PATCH /spans/:id`
Update a span (end it or change status).

```bash
curl -X PATCH http://localhost:3000/spans/uuid \
  -H "Content-Type: application/json" \
  -d '{
    "endTime": "2024-01-01T00:00:01.000Z",
    "durationMs": 45,
    "status": "completed"
  }'
```

### Settings API

#### `GET /settings`
Get current retention and cleanup settings.

```json
{
  "logsRetentionDays": 7,
  "tracesRetentionDays": 14,
  "spansRetentionDays": 14,
  "errorGroupsRetentionDays": 30,
  "cleanupEnabled": true,
  "cleanupIntervalHours": 1
}
```

#### `PATCH /settings`
Update retention and cleanup settings.

```bash
curl -X PATCH http://localhost:3000/settings \
  -H "Content-Type: application/json" \
  -d '{
    "logsRetentionDays": 14,
    "cleanupEnabled": true,
    "cleanupIntervalHours": 2
  }'
```

#### `GET /settings/stats`
Get storage statistics.

```json
{
  "totalLogs": 12345,
  "totalTraces": 500,
  "totalSpans": 2500,
  "totalErrorGroups": 42,
  "databaseSizeBytes": 10485760,
  "oldestLog": "2024-01-01T00:00:00.000Z",
  "oldestTrace": "2024-01-01T00:00:00.000Z"
}
```

#### `POST /settings/cleanup`
Trigger manual cleanup based on current retention settings.

```json
{
  "logsDeleted": 150,
  "tracesDeleted": 25,
  "spansDeleted": 100,
  "errorGroupsDeleted": 5,
  "durationMs": 45
}
```

#### `WebSocket /live`
Real-time log streaming.

```javascript
const ws = new WebSocket('ws://localhost:3000/live');

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === 'log') {
    console.log('New log:', data);
  }
};
```

## 🖥️ Web UI Features

- **Live Mode** - Real-time log streaming via WebSocket
- **Filtering** - Filter by level, app, session, date range, and text search
- **Advanced Search** - Datadog-like search syntax (`level:error app:myapp key:value`)
- **Detail View** - Expandable log entries with full metadata and stack traces
- **Error Tracking** - Automatic error grouping with:
  - Fingerprint-based deduplication
  - Status management (unreviewed, reviewed, ignored, resolved)
  - Occurrence history with charts
  - Bulk actions for triaging
  - Option to hide ignored errors from the main feed
- **Distributed Tracing** - Full APM-like tracing with:
  - Waterfall timeline visualization
  - Nested span hierarchy
  - Duration breakdown
  - Associated logs per trace
  - Status indicators (running, completed, error)
- **Data Retention & Cleanup** - Automatic data management:
  - Configurable retention periods per data type (logs, traces, spans, error groups)
  - Automatic cleanup job (runs hourly by default)
  - Manual cleanup trigger
  - Storage statistics (database size, record counts, oldest data)
  - Set retention to 0 to disable cleanup for specific types
- **Dark Theme** - Beautiful dark UI optimized for readability
- **Responsive** - Works on desktop and mobile

## 🛠️ Development

### Build All Packages

```bash
pnpm build
```

### Build Individual Packages

```bash
pnpm build:sdk
pnpm build:server
pnpm build:web
```

### Testing

The project includes comprehensive tests for all packages using Vitest.

```bash
# Run all tests across the monorepo
pnpm test:run

# Run tests in watch mode
pnpm test

# Run tests for specific packages
pnpm test:sdk      # SDK tests (44 tests)
pnpm test:server   # Server tests (53 tests)
pnpm test:web      # Web tests (19 tests)
```

#### Test Architecture

- **SDK**: Uses MSW (Mock Service Worker) for API mocking
- **Server**: Uses in-memory SQLite for test isolation (`:memory:`)
- **Web**: Uses happy-dom for Vue component testing

```bash
# Generate test logs (manual testing)
node -e "
const { createLogger } = require('./packages/sdk/dist');
const logger = createLogger({
  endpoint: 'http://localhost:3000/ingest',
  appName: 'test'
});
logger.info('Test log');
logger.error('Test error', { error: new Error('Test') });
"
```

## 📝 Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DB_TYPE` | `sqlite` | Database type (`sqlite`, `postgresql`, `mysql`) |
| `DATABASE_URL` | `./data/trace-dock.sqlite` | Database connection URL |
| `DATA_DIR` | `./data` | SQLite database directory (legacy) |
| `DB_PATH` | `${DATA_DIR}/trace-dock.sqlite` | Database file path (legacy) |
| `DB_DEBUG` | `false` | Enable database debug logging |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |
| `CORS_ALLOW_ALL` | `false` | Allow all origins (use with caution) |

### Web

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | API base URL |
| `VITE_WS_URL` | Auto-detected | WebSocket URL |

## 🗄️ Database Setup

Trace Dock uses Drizzle ORM and supports multiple database backends. **The database is automatically initialized on first startup** - no manual migration is required.

### First Time Setup

1. **Choose your database** by setting environment variables:

```bash
# SQLite (default - no setup needed)
DB_TYPE=sqlite
DATABASE_URL=./data/trace-dock.sqlite

# PostgreSQL
DB_TYPE=postgresql
DATABASE_URL=postgres://user:password@localhost:5432/tracedock

# MySQL
DB_TYPE=mysql
DATABASE_URL=mysql://user:password@localhost:3306/tracedock
```

2. **Start the server** - tables are created automatically:

```bash
pnpm dev:server
# or
pnpm docker:up
```

That's it! The server will create all necessary tables on startup.

### ⚠️ Warning: Switching Databases

**Switching between database types (e.g., SQLite → PostgreSQL) will result in data loss.**

The data is stored in the specific database you configure. If you change `DB_TYPE`:
- Your existing data stays in the old database
- The new database starts empty
- There is no automatic migration between database types

**If you need to switch databases:**
1. Export your data from the old database (if needed)
2. Change the `DB_TYPE` and `DATABASE_URL` environment variables
3. Restart the server (new empty tables will be created)
4. Import your data (if applicable)

### Development Scripts

For development and advanced usage, you can use these scripts:

```bash
# Generate Drizzle migrations (for contributing)
pnpm --filter @trace-dock/server db:generate --type=sqlite
pnpm --filter @trace-dock/server db:generate --type=postgresql
pnpm --filter @trace-dock/server db:generate --type=mysql

# Initialize database manually (usually not needed)
pnpm --filter @trace-dock/server db:setup --type=sqlite
```

## 🗄️ Database Configuration

Trace Dock supports multiple database backends via Drizzle ORM:

### SQLite (Default)

SQLite is the default database, perfect for development and small deployments.

```bash
# Default configuration - no setup needed
DB_TYPE=sqlite
DATABASE_URL=./data/trace-dock.sqlite
```

### PostgreSQL

For production deployments with higher concurrency needs.

```bash
DB_TYPE=postgresql
DATABASE_URL=postgres://user:password@localhost:5432/tracedock
```

Docker Compose example with PostgreSQL:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tracedock
      POSTGRES_USER: tracedock
      POSTGRES_PASSWORD: secret
    volumes:
      - postgres-data:/var/lib/postgresql/data

  server:
    environment:
      - DB_TYPE=postgresql
      - DATABASE_URL=postgres://tracedock:secret@postgres:5432/tracedock
```

### MySQL / MariaDB

```bash
DB_TYPE=mysql
DATABASE_URL=mysql://user:password@localhost:3306/tracedock
```

> **Note**: PostgreSQL and MySQL support requires implementing the respective repository adapters. Currently, only SQLite is fully implemented. The schema definitions for PostgreSQL and MySQL are ready in `server/src/db/schema/`.

## 🐳 Docker Configuration

### Quick Start

```bash
# Build and start all services (SQLite)
pnpm docker:up

# Or using docker-compose directly
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
pnpm docker:down
```

### Custom Configuration

Create a `.env` file in the root directory:

```env
# Server port (default: 3000)
SERVER_PORT=3000

# Web port (default: 8080)  
WEB_PORT=8080

# Database type: sqlite | postgresql | mysql
DB_TYPE=sqlite

# Database URL (for PostgreSQL/MySQL)
# DATABASE_URL=postgres://user:pass@host:5432/tracedock

# CORS origins
CORS_ORIGINS=http://localhost:8080,http://localhost:3000
```

### Docker Compose with PostgreSQL

Create a `docker-compose.override.yml` for PostgreSQL:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: trace-dock-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: tracedock
      POSTGRES_USER: tracedock
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tracedock"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - DB_TYPE=postgresql
      - DATABASE_URL=postgres://tracedock:${POSTGRES_PASSWORD:-changeme}@postgres:5432/tracedock

volumes:
  postgres-data:
    driver: local
```

### Volume Mounts

Data is persisted using Docker volumes:

```yaml
volumes:
  trace-dock-data:    # SQLite database
    driver: local
  postgres-data:      # PostgreSQL data (if using)
    driver: local
```

### Health Checks

Both services include health checks:
- **Server**: `GET /` - Returns server status
- **Web**: `GET /` - Returns nginx status

### Building Images Separately

```bash
# Build server image
docker build -f server/Dockerfile -t trace-dock-server .

# Build web image
docker build -f web/Dockerfile -t trace-dock-web \
  --build-arg VITE_API_BASE_URL=/api .
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

Made with ❤️ by the Trace Dock team
