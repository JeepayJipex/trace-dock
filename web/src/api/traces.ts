import type { TracesResponse, TraceWithDetails, TraceFilters, TraceStats } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function getTraces(filters: TraceFilters & { limit?: number; offset?: number } = {}): Promise<TracesResponse> {
  const params = new URLSearchParams();
  
  if (filters.appName) params.set('appName', filters.appName);
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.status) params.set('status', filters.status);
  if (filters.name) params.set('name', filters.name);
  if (filters.minDuration !== undefined) params.set('minDuration', filters.minDuration.toString());
  if (filters.maxDuration !== undefined) params.set('maxDuration', filters.maxDuration.toString());
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.limit !== undefined) params.set('limit', filters.limit.toString());
  if (filters.offset !== undefined) params.set('offset', filters.offset.toString());
  
  const response = await fetch(`${API_BASE}/traces?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch traces: ${response.statusText}`);
  }
  return response.json();
}

export async function getTraceById(id: string): Promise<TraceWithDetails> {
  const response = await fetch(`${API_BASE}/traces/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch trace: ${response.statusText}`);
  }
  return response.json();
}

export async function getTraceStats(): Promise<TraceStats> {
  const response = await fetch(`${API_BASE}/traces/stats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch trace stats: ${response.statusText}`);
  }
  return response.json();
}
