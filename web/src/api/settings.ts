import type { RetentionSettings, StorageStats, CleanupResult } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export async function getSettings(): Promise<RetentionSettings> {
  const response = await fetch(`${API_BASE}/settings`);
  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }
  return response.json();
}

export async function updateSettings(settings: Partial<RetentionSettings>): Promise<RetentionSettings> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error('Failed to update settings');
  }
  return response.json();
}

export async function getStorageStats(): Promise<StorageStats> {
  const response = await fetch(`${API_BASE}/settings/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch storage stats');
  }
  return response.json();
}

export async function runCleanup(): Promise<CleanupResult> {
  const response = await fetch(`${API_BASE}/settings/cleanup`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to run cleanup');
  }
  return response.json();
}

export async function purgeAllData(): Promise<CleanupResult> {
  const response = await fetch(`${API_BASE}/settings/purge`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to purge data');
  }
  return response.json();
}
