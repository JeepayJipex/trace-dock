import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';
import { resetCapturedRequests } from './mocks/handlers';

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset handlers and captured requests after each test
afterEach(() => {
  server.resetHandlers();
  resetCapturedRequests();
});

// Clean up after all tests
afterAll(() => server.close());
