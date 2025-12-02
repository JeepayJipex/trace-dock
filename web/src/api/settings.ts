import type { RetentionSettings, StorageStats, CleanupResult } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function getSettings(): Promise<RetentionSettings> {
  const response = await fetch(`${API_URL}/settings`);
  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }
  return response.json();
}

export async function updateSettings(settings: Partial<RetentionSettings>): Promise<RetentionSettings> {
  const response = await fetch(`${API_URL}/settings`, {
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
  const response = await fetch(`${API_URL}/settings/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch storage stats');
  }
  return response.json();
}

export async function runCleanup(): Promise<CleanupResult> {
  const response = await fetch(`${API_URL}/settings/cleanup`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to run cleanup');
  }
  return response.json();
}
