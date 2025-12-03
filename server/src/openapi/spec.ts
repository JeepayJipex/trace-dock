// OpenAPI 3.0 Specification for Trace-Dock API

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Trace-Dock API',
    version: '1.0.0',
    description: 'API for log ingestion, distributed tracing, and error tracking. Trace-Dock provides a centralized platform for collecting and analyzing logs from your applications.',
    contact: {
      name: 'Trace-Dock',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Logs', description: 'Log management and ingestion' },
    { name: 'Error Groups', description: 'Error grouping and tracking' },
    { name: 'Traces', description: 'Distributed tracing endpoints' },
    { name: 'Settings', description: 'Configuration and retention settings' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns the health status of the server',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthCheck',
                },
              },
            },
          },
        },
      },
    },
    '/ingest': {
      post: {
        tags: ['Logs'],
        summary: 'Ingest a log entry',
        description: 'Receives a log entry from the SDK and stores it. The log is also broadcast to connected WebSocket clients.',
        operationId: 'ingestLog',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LogEntry',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Log ingested successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    id: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid log entry',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/logs': {
      get: {
        tags: ['Logs'],
        summary: 'Get logs',
        description: 'Retrieves logs with pagination and filtering',
        operationId: 'getLogs',
        parameters: [
          { name: 'level', in: 'query', schema: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] }, description: 'Filter by log level' },
          { name: 'appName', in: 'query', schema: { type: 'string' }, description: 'Filter by application name' },
          { name: 'sessionId', in: 'query', schema: { type: 'string' }, description: 'Filter by session ID' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search term' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Start date filter' },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'End date filter' },
          { name: 'traceId', in: 'query', schema: { type: 'string' }, description: 'Filter by trace ID' },
          { name: 'spanId', in: 'query', schema: { type: 'string' }, description: 'Filter by span ID' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 50 }, description: 'Maximum number of results' },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 }, description: 'Number of results to skip' },
        ],
        responses: {
          '200': {
            description: 'List of logs',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LogsResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid query parameters',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/logs/{id}': {
      get: {
        tags: ['Logs'],
        summary: 'Get log by ID',
        description: 'Retrieves a single log entry by its ID',
        operationId: 'getLogById',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Log ID' },
        ],
        responses: {
          '200': {
            description: 'Log entry',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LogEntry',
                },
              },
            },
          },
          '404': {
            description: 'Log not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/stats': {
      get: {
        tags: ['Logs'],
        summary: 'Get statistics',
        description: 'Returns aggregated log statistics',
        operationId: 'getStats',
        responses: {
          '200': {
            description: 'Statistics',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Stats',
                },
              },
            },
          },
        },
      },
    },
    '/apps': {
      get: {
        tags: ['Logs'],
        summary: 'Get application names',
        description: 'Returns list of unique application names',
        operationId: 'getApps',
        responses: {
          '200': {
            description: 'List of application names',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apps: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/sessions': {
      get: {
        tags: ['Logs'],
        summary: 'Get session IDs',
        description: 'Returns list of session IDs, optionally filtered by app',
        operationId: 'getSessions',
        parameters: [
          { name: 'appName', in: 'query', schema: { type: 'string' }, description: 'Filter by application name' },
        ],
        responses: {
          '200': {
            description: 'List of session IDs',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessions: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/suggestions': {
      get: {
        tags: ['Logs'],
        summary: 'Get search suggestions',
        description: 'Returns autocomplete suggestions for search',
        operationId: 'getSuggestions',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search prefix' },
        ],
        responses: {
          '200': {
            description: 'Search suggestions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    suggestions: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/metadata-keys': {
      get: {
        tags: ['Logs'],
        summary: 'Get metadata keys',
        description: 'Returns available metadata keys for filtering',
        operationId: 'getMetadataKeys',
        responses: {
          '200': {
            description: 'Metadata keys',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    keys: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/error-groups': {
      get: {
        tags: ['Error Groups'],
        summary: 'Get error groups',
        description: 'Retrieves error groups with pagination and filtering',
        operationId: 'getErrorGroups',
        parameters: [
          { name: 'appName', in: 'query', schema: { type: 'string' }, description: 'Filter by application name' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['unreviewed', 'reviewed', 'ignored', 'resolved'] }, description: 'Filter by status' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search term' },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['last_seen', 'first_seen', 'occurrence_count'], default: 'last_seen' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of error groups',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorGroupsResponse',
                },
              },
            },
          },
        },
      },
    },
    '/error-groups/stats': {
      get: {
        tags: ['Error Groups'],
        summary: 'Get error group statistics',
        description: 'Returns aggregated error group statistics',
        operationId: 'getErrorGroupStats',
        responses: {
          '200': {
            description: 'Error group statistics',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorGroupStats',
                },
              },
            },
          },
        },
      },
    },
    '/error-groups/{id}': {
      get: {
        tags: ['Error Groups'],
        summary: 'Get error group by ID',
        description: 'Retrieves a single error group by its ID',
        operationId: 'getErrorGroupById',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Error group ID' },
        ],
        responses: {
          '200': {
            description: 'Error group',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorGroup',
                },
              },
            },
          },
          '404': {
            description: 'Error group not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/error-groups/{id}/status': {
      patch: {
        tags: ['Error Groups'],
        summary: 'Update error group status',
        description: 'Updates the status of an error group',
        operationId: 'updateErrorGroupStatus',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Error group ID' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['unreviewed', 'reviewed', 'ignored', 'resolved'],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Status updated',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SuccessResponse',
                },
              },
            },
          },
          '404': {
            description: 'Error group not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/error-groups/{id}/occurrences': {
      get: {
        tags: ['Error Groups'],
        summary: 'Get error group occurrences',
        description: 'Retrieves log entries for a specific error group',
        operationId: 'getErrorGroupOccurrences',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Error group ID' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          '200': {
            description: 'Error occurrences',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LogsResponse',
                },
              },
            },
          },
          '404': {
            description: 'Error group not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/traces': {
      get: {
        tags: ['Traces'],
        summary: 'Get traces',
        description: 'Retrieves traces with pagination and filtering',
        operationId: 'getTraces',
        parameters: [
          { name: 'serviceName', in: 'query', schema: { type: 'string' }, description: 'Filter by service/app name' },
          { name: 'operationName', in: 'query', schema: { type: 'string' }, description: 'Filter by operation name' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['running', 'completed', 'error'] }, description: 'Filter by status' },
          { name: 'minDuration', in: 'query', schema: { type: 'integer' }, description: 'Minimum duration in ms' },
          { name: 'maxDuration', in: 'query', schema: { type: 'integer' }, description: 'Maximum duration in ms' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of traces',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TracesResponse',
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Traces'],
        summary: 'Create a trace',
        description: 'Creates a new trace',
        operationId: 'createTrace',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateTrace',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Trace created',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Trace',
                },
              },
            },
          },
        },
      },
    },
    '/traces/stats': {
      get: {
        tags: ['Traces'],
        summary: 'Get trace statistics',
        description: 'Returns aggregated trace statistics',
        operationId: 'getTraceStats',
        responses: {
          '200': {
            description: 'Trace statistics',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TraceStats',
                },
              },
            },
          },
        },
      },
    },
    '/traces/{id}': {
      get: {
        tags: ['Traces'],
        summary: 'Get trace by ID',
        description: 'Retrieves a single trace with its spans and logs',
        operationId: 'getTraceById',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Trace ID' },
        ],
        responses: {
          '200': {
            description: 'Trace details',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TraceDetail',
                },
              },
            },
          },
          '404': {
            description: 'Trace not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
      patch: {
        tags: ['Traces'],
        summary: 'Update a trace',
        description: 'Updates a trace (end it or change status)',
        operationId: 'updateTrace',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Trace ID' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  endTime: { type: 'string', format: 'date-time' },
                  durationMs: { type: 'number' },
                  status: { type: 'string', enum: ['running', 'completed', 'error'] },
                  metadata: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Trace updated',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SuccessResponse',
                },
              },
            },
          },
          '404': {
            description: 'Trace not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/traces/{id}/spans': {
      get: {
        tags: ['Traces'],
        summary: 'Get trace spans',
        description: 'Retrieves spans for a specific trace',
        operationId: 'getTraceSpans',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Trace ID' },
        ],
        responses: {
          '200': {
            description: 'Trace spans',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    spans: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Span' },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Trace not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/spans': {
      post: {
        tags: ['Traces'],
        summary: 'Create a span',
        description: 'Creates a new span within a trace',
        operationId: 'createSpan',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateSpan',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Span created',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Span',
                },
              },
            },
          },
          '404': {
            description: 'Trace not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/spans/{id}': {
      patch: {
        tags: ['Traces'],
        summary: 'Update a span',
        description: 'Updates a span (end it or change status)',
        operationId: 'updateSpan',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Span ID' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  endTime: { type: 'string', format: 'date-time' },
                  durationMs: { type: 'number' },
                  status: { type: 'string', enum: ['running', 'completed', 'error'] },
                  metadata: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Span updated',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SuccessResponse',
                },
              },
            },
          },
          '404': {
            description: 'Span not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get settings',
        description: 'Returns current retention and cleanup settings',
        operationId: 'getSettings',
        responses: {
          '200': {
            description: 'Current settings',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RetentionSettings',
                },
              },
            },
          },
        },
      },
      patch: {
        tags: ['Settings'],
        summary: 'Update settings',
        description: 'Updates retention and cleanup settings',
        operationId: 'updateSettings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RetentionSettings',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated settings',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RetentionSettings',
                },
              },
            },
          },
        },
      },
    },
    '/settings/stats': {
      get: {
        tags: ['Settings'],
        summary: 'Get storage statistics',
        description: 'Returns storage usage statistics',
        operationId: 'getStorageStats',
        responses: {
          '200': {
            description: 'Storage statistics',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/StorageStats',
                },
              },
            },
          },
        },
      },
    },
    '/settings/cleanup': {
      post: {
        tags: ['Settings'],
        summary: 'Run manual cleanup',
        description: 'Triggers a manual cleanup of old data',
        operationId: 'runCleanup',
        responses: {
          '200': {
            description: 'Cleanup result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CleanupResult',
                },
              },
            },
          },
        },
      },
    },
    '/settings/purge': {
      post: {
        tags: ['Settings'],
        summary: 'Purge all data',
        description: 'Deletes all data from the database. Use with caution!',
        operationId: 'purgeData',
        responses: {
          '200': {
            description: 'Purge result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CleanupResult',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthCheck: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'trace-dock' },
          version: { type: 'string', example: '1.0.0' },
          status: { type: 'string', example: 'healthy' },
          timestamp: { type: 'string', format: 'date-time' },
          wsClients: { type: 'integer', description: 'Number of connected WebSocket clients' },
        },
      },
      EnvironmentInfo: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['browser', 'node', 'tauri', 'unknown'] },
          userAgent: { type: 'string' },
          url: { type: 'string' },
          nodeVersion: { type: 'string', example: 'v20.10.0' },
          platform: { type: 'string', example: 'linux' },
          arch: { type: 'string', example: 'x64' },
          tauriVersion: { type: 'string' },
        },
      },
      SourceLocation: {
        type: 'object',
        required: ['file', 'line', 'column'],
        properties: {
          file: { type: 'string', description: 'Source file path' },
          line: { type: 'integer', description: 'Line number in the source file' },
          column: { type: 'integer', description: 'Column number in the source file' },
          function: { type: 'string', description: 'Function name (if available)' },
        },
      },
      LogEntry: {
        type: 'object',
        required: ['id', 'timestamp', 'level', 'message', 'appName', 'sessionId', 'environment'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          timestamp: { type: 'string', format: 'date-time' },
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          message: { type: 'string' },
          appName: { type: 'string' },
          sessionId: { type: 'string' },
          environment: { $ref: '#/components/schemas/EnvironmentInfo' },
          metadata: { type: 'object', additionalProperties: true },
          stackTrace: { type: 'string' },
          sourceLocation: { $ref: '#/components/schemas/SourceLocation' },
          context: { type: 'object', additionalProperties: true },
          errorGroupId: { type: 'string' },
          traceId: { type: 'string' },
          spanId: { type: 'string' },
          parentSpanId: { type: 'string' },
        },
      },
      LogsResponse: {
        type: 'object',
        properties: {
          logs: {
            type: 'array',
            items: { $ref: '#/components/schemas/LogEntry' },
          },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
      Stats: {
        type: 'object',
        properties: {
          totalLogs: { type: 'integer' },
          logsByLevel: { type: 'object', additionalProperties: { type: 'integer' } },
          logsByApp: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      },
      ErrorGroup: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          fingerprint: { type: 'string' },
          message: { type: 'string' },
          appName: { type: 'string' },
          firstSeen: { type: 'string', format: 'date-time' },
          lastSeen: { type: 'string', format: 'date-time' },
          occurrenceCount: { type: 'integer' },
          status: { type: 'string', enum: ['unreviewed', 'reviewed', 'ignored', 'resolved'] },
          stackTracePreview: { type: 'string' },
        },
      },
      ErrorGroupsResponse: {
        type: 'object',
        properties: {
          errorGroups: {
            type: 'array',
            items: { $ref: '#/components/schemas/ErrorGroup' },
          },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
      ErrorGroupStats: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
          byApp: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      },
      Trace: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          appName: { type: 'string' },
          sessionId: { type: 'string' },
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time', nullable: true },
          durationMs: { type: 'number', nullable: true },
          status: { type: 'string', enum: ['running', 'completed', 'error'] },
          spanCount: { type: 'integer' },
          errorCount: { type: 'integer' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      CreateTrace: {
        type: 'object',
        required: ['name', 'appName'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          appName: { type: 'string' },
          sessionId: { type: 'string' },
          startTime: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['running', 'completed', 'error'] },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      TracesResponse: {
        type: 'object',
        properties: {
          traces: {
            type: 'array',
            items: { $ref: '#/components/schemas/Trace' },
          },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
      TraceDetail: {
        type: 'object',
        properties: {
          trace: { $ref: '#/components/schemas/Trace' },
          spans: {
            type: 'array',
            items: { $ref: '#/components/schemas/Span' },
          },
          logs: {
            type: 'array',
            items: { $ref: '#/components/schemas/LogEntry' },
          },
        },
      },
      TraceStats: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
          avgDurationMs: { type: 'number', nullable: true },
        },
      },
      Span: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          traceId: { type: 'string' },
          parentSpanId: { type: 'string', nullable: true },
          name: { type: 'string' },
          operationType: { type: 'string', nullable: true },
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time', nullable: true },
          durationMs: { type: 'number', nullable: true },
          status: { type: 'string', enum: ['running', 'completed', 'error'] },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      CreateSpan: {
        type: 'object',
        required: ['traceId', 'name'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          traceId: { type: 'string' },
          parentSpanId: { type: 'string' },
          name: { type: 'string' },
          operationType: { type: 'string' },
          startTime: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['running', 'completed', 'error'] },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      RetentionSettings: {
        type: 'object',
        properties: {
          retentionDays: { type: 'integer', example: 30 },
          cleanupEnabled: { type: 'boolean' },
          cleanupIntervalHours: { type: 'integer' },
        },
      },
      StorageStats: {
        type: 'object',
        properties: {
          totalLogs: { type: 'integer' },
          totalTraces: { type: 'integer' },
          totalSpans: { type: 'integer' },
          totalErrorGroups: { type: 'integer' },
          oldestLog: { type: 'string', format: 'date-time', nullable: true },
          newestLog: { type: 'string', format: 'date-time', nullable: true },
          databaseSizeBytes: { type: 'integer' },
        },
      },
      CleanupResult: {
        type: 'object',
        properties: {
          deletedLogs: { type: 'integer' },
          deletedTraces: { type: 'integer' },
          deletedSpans: { type: 'integer' },
          deletedErrorGroups: { type: 'integer' },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'object' },
        },
      },
    },
  },
};
