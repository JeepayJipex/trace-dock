import type { EnvironmentInfo } from './types';

declare const __TAURI__: unknown;

/**
 * Detects the current runtime environment and gathers info
 */
export function detectEnvironment(): EnvironmentInfo {
  // Check for Tauri
  if (typeof __TAURI__ !== 'undefined') {
    return {
      type: 'tauri',
      tauriVersion: getTauriVersion(),
      platform: getPlatform(),
    };
  }

  // Check for browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return {
      type: 'browser',
      userAgent: navigator.userAgent,
      url: window.location.href,
      platform: navigator.platform,
    };
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return {
      type: 'node',
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    };
  }

  return { type: 'unknown' };
}

function getTauriVersion(): string | undefined {
  try {
    // @ts-expect-error Tauri global
    return __TAURI__?.version || 'unknown';
  } catch {
    return undefined;
  }
}

function getPlatform(): string | undefined {
  if (typeof navigator !== 'undefined') {
    return navigator.platform;
  }
  if (typeof process !== 'undefined') {
    return process.platform;
  }
  return undefined;
}
