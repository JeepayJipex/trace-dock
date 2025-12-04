# Trace-Dock

[![Docker Pulls](https://img.shields.io/docker/pulls/jeepayjipex/trace-dock)](https://hub.docker.com/r/jeepayjipex/trace-dock)
[![Docker Image Size](https://img.shields.io/docker/image-size/jeepayjipex/trace-dock/latest)](https://hub.docker.com/r/jeepayjipex/trace-dock)

A unified observability platform for collecting and visualizing OpenTelemetry traces, logs, and metrics.

## Quick Start

```bash
docker run -d \
  --name trace-dock \
  -p 8080:80 \
  -v trace-dock-data:/app/data \
  jeepayjipex/trace-dock:latest
```

Access the web UI at **http://localhost:8080**

## Features

- 📊 **Real-time log visualization** - View and search logs in real-time
- 🔍 **Trace analysis** - Analyze distributed traces with detailed span information
- 📈 **Metrics dashboard** - Monitor your application metrics
- 🗄️ **Multiple database support** - SQLite (default), PostgreSQL, MySQL
- 🔌 **Easy SDK integration** - Simple JavaScript/TypeScript SDK

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_TYPE` | `sqlite` | Database type: `sqlite`, `postgresql`, `mysql` |
| `DATABASE_URL` | `/app/data/trace-dock.sqlite` | Database connection URL or file path |
| `DATA_DIR` | `/app/data` | Data directory for SQLite and other files |
| `PORT` | `3000` | Internal server port (usually no need to change) |
| `RUN_MIGRATIONS` | `true` | Automatically run database migrations on startup |
| `DB_DEBUG` | `false` | Enable database debug logging |

## Docker Compose

### Simple (SQLite)

```yaml
version: '3.8'

services:
  trace-dock:
    image: jeepayjipex/trace-dock:latest
    container_name: trace-dock
    ports:
      - "8080:80"
    volumes:
      - trace-dock-data:/app/data
    environment:
      - DB_TYPE=sqlite
      - RUN_MIGRATIONS=true
    restart: unless-stopped

volumes:
  trace-dock-data:
```

### With PostgreSQL

```yaml
version: '3.8'

services:
  trace-dock:
    image: jeepayjipex/trace-dock:latest
    container_name: trace-dock
    ports:
      - "8080:80"
    environment:
      - DB_TYPE=postgresql
      - DATABASE_URL=postgres://tracedock:password@db:5432/tracedock
      - RUN_MIGRATIONS=true
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    container_name: trace-dock-db
    environment:
      POSTGRES_USER: tracedock
      POSTGRES_PASSWORD: password
      POSTGRES_DB: tracedock
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tracedock"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres-data:
```

### With MySQL

```yaml
version: '3.8'

services:
  trace-dock:
    image: jeepayjipex/trace-dock:latest
    container_name: trace-dock
    ports:
      - "8080:80"
    environment:
      - DB_TYPE=mysql
      - DATABASE_URL=mysql://tracedock:password@db:3306/tracedock
      - RUN_MIGRATIONS=true
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: mysql:8
    container_name: trace-dock-db
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: tracedock
      MYSQL_USER: tracedock
      MYSQL_PASSWORD: password
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  mysql-data:
```

## Exposed Ports

| Port | Description |
|------|-------------|
| `80` | Web UI (nginx) - Main access point |
| `3000` | API Server (internal, proxied via nginx at `/api`) |

## Volume

The `/app/data` volume is used for:
- SQLite database file (when using SQLite)
- Any other persistent data

## SDK Integration

Install the SDK in your Node.js application:

```bash
npm install @trace-dock/sdk
```

### Basic Logging

```typescript
import { createLogger } from '@trace-dock/sdk';

const logger = createLogger({
  endpoint: 'http://localhost:8080/api/ingest',  // Docker: through nginx proxy
  // endpoint: 'http://localhost:3001/ingest',   // Dev: direct to server
  appName: 'my-service',
});

// Log messages at different levels
logger.debug('Debug message', { extra: 'data' });
logger.info('User logged in', { userId: 123 });
logger.warn('High memory usage', { usage: '85%' });
logger.error('Database connection failed', { error: new Error('Connection refused') });

// Child logger with additional context
const userLogger = logger.child({ userId: 123, module: 'auth' });
userLogger.info('User action'); // Includes userId and module in all logs
```

### Tracing

```typescript
import { createTracer } from '@trace-dock/sdk';

const tracer = createTracer({
  endpoint: 'http://localhost:8080/api/ingest',  // Docker: through nginx proxy
  // endpoint: 'http://localhost:3001/ingest',   // Dev: direct to server
  appName: 'my-service',
});

// Trace an entire operation with automatic span management
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

// Manual trace management
const traceId = tracer.startTrace('my-operation');
const spanId = tracer.startSpan('sub-operation', { operationType: 'db' });
// ... do work ...
tracer.endSpan(spanId);
tracer.endTrace(traceId);
```

## Tags

- `latest` - Latest stable release from main branch
- `vX.Y.Z` - Specific version releases
- `dev` - Development branch (unstable)
- `sha-XXXXXX` - Specific commit builds

## Health Check

The container includes a health check endpoint at `/health` that returns `200 OK` when the service is ready.

## Architecture

This is an all-in-one container that includes:
- **Nginx** - Serves the web UI and proxies API requests
- **Node.js Server** - Handles API requests and WebSocket connections
- **Supervisor** - Manages both processes

## Support

- GitHub: [https://github.com/JeepayJipex/trace-dock](https://github.com/JeepayJipex/trace-dock)
- Issues: [https://github.com/JeepayJipex/trace-dock/issues](https://github.com/JeepayJipex/trace-dock/issues)

## License

MIT License
