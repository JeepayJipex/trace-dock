import type { 
  ErrorGroup, 
  ErrorGroupsResponse, 
  ErrorGroupFilters, 
  ErrorGroupStats,
  ErrorGroupStatus,
  LogsResponse,
  LogsWithIgnoredResponse,
  LogFilters,
} from '@/types';

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

export async function getErrorGroups(
  filters: ErrorGroupFilters = {},
  limit = 20,
  offset = 0
): Promise<ErrorGroupsResponse> {
  const params = new URLSearchParams();
  
  if (filters.appName) params.set('appName', filters.appName);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  return fetchJson<ErrorGroupsResponse>(`${API_BASE}/error-groups?${params}`);
}

export async function getErrorGroup(id: string): Promise<ErrorGroup> {
  return fetchJson<ErrorGroup>(`${API_BASE}/error-groups/${id}`);
}

export async function getErrorGroupStats(): Promise<ErrorGroupStats> {
  return fetchJson<ErrorGroupStats>(`${API_BASE}/error-groups/stats`);
}

export async function updateErrorGroupStatus(
  id: string, 
  status: ErrorGroupStatus
): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>(`${API_BASE}/error-groups/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getErrorGroupOccurrences(
  id: string,
  limit = 50,
  offset = 0
): Promise<LogsResponse> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  return fetchJson<LogsResponse>(`${API_BASE}/error-groups/${id}/occurrences?${params}`);
}

export async function getLogsFiltered(
  filters: LogFilters = {},
  limit = 50,
  offset = 0,
  excludeIgnored = false
): Promise<LogsWithIgnoredResponse> {
  const params = new URLSearchParams();
  
  if (filters.level) params.set('level', filters.level);
  if (filters.appName) params.set('appName', filters.appName);
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.search) params.set('search', filters.search);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());
  params.set('excludeIgnored', excludeIgnored.toString());

  return fetchJson<LogsWithIgnoredResponse>(`${API_BASE}/logs-filtered?${params}`);
}
