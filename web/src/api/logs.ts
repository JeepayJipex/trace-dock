import type { LogEntry, LogsResponse, LogFilters, StatsResponse } from '@/types';

// Base URL configurable via env variable, defaults to localhost:3001 in dev
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function getLogs(
  filters: LogFilters = {},
  limit = 50,
  offset = 0
): Promise<LogsResponse> {
  const params = new URLSearchParams();
  
  if (filters.level) params.set('level', filters.level);
  if (filters.appName) params.set('appName', filters.appName);
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.search) params.set('search', filters.search);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  return fetchJson<LogsResponse>(`${API_BASE}/logs?${params}`);
}

export async function getLog(id: string): Promise<LogEntry> {
  return fetchJson<LogEntry>(`${API_BASE}/logs/${id}`);
}

export async function getStats(): Promise<StatsResponse> {
  return fetchJson<StatsResponse>(`${API_BASE}/stats`);
}

export async function getApps(): Promise<{ apps: string[] }> {
  return fetchJson<{ apps: string[] }>(`${API_BASE}/apps`);
}

export async function getSessions(appName?: string): Promise<{ sessions: string[] }> {
  const params = appName ? `?appName=${encodeURIComponent(appName)}` : '';
  return fetchJson<{ sessions: string[] }>(`${API_BASE}/sessions${params}`);
}

export async function getSearchSuggestions(prefix: string): Promise<{ suggestions: { type: string; value: string }[] }> {
  return fetchJson<{ suggestions: { type: string; value: string }[] }>(
    `${API_BASE}/suggestions?q=${encodeURIComponent(prefix)}`
  );
}

export async function getMetadataKeys(): Promise<{ keys: string[] }> {
  return fetchJson<{ keys: string[] }>(`${API_BASE}/metadata-keys`);
}
