import { http, HttpResponse } from 'msw';

// Store captured requests for assertions
export const capturedRequests: {
  ingest: Array<{ url: string; body: Record<string, unknown> }>;
  traces: Array<{ url: string; body: Record<string, unknown>; method: string }>;
  spans: Array<{ url: string; body: Record<string, unknown>; method: string }>;
} = {
  ingest: [],
  traces: [],
  spans: [],
};

// Reset captured requests
export function resetCapturedRequests() {
  capturedRequests.ingest = [];
  capturedRequests.traces = [];
  capturedRequests.spans = [];
}

export const handlers = [
  // Ingest endpoint for logs
  http.post('http://localhost:3001/ingest', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    capturedRequests.ingest.push({ url: request.url, body });
    return HttpResponse.json({ success: true });
  }),

  // Traces endpoints
  http.post('http://localhost:3001/traces', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    capturedRequests.traces.push({ url: request.url, body, method: 'POST' });
    return HttpResponse.json({ success: true, id: body.id });
  }),

  http.patch(/^http:\/\/localhost:3001\/traces\/.*$/, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    capturedRequests.traces.push({ 
      url: request.url, 
      body: { ...body, id }, 
      method: 'PATCH' 
    });
    return HttpResponse.json({ success: true });
  }),

  // Spans endpoints
  http.post('http://localhost:3001/spans', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    capturedRequests.spans.push({ url: request.url, body, method: 'POST' });
    return HttpResponse.json({ success: true, id: body.id });
  }),

  http.patch(/^http:\/\/localhost:3001\/spans\/.*$/, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    capturedRequests.spans.push({ 
      url: request.url, 
      body: { ...body, id }, 
      method: 'PATCH' 
    });
    return HttpResponse.json({ success: true });
  }),
];
