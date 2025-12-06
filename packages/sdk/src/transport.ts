import type { LogEntry, TransportOptions } from './types';
import { safeStringify } from './utils';

/**
 * HTTP Transport for sending logs to the server
 */
export class HttpTransport {
  private endpoint: string;
  private maxRetries: number;
  private onError?: (error: Error) => void;
  private queue: LogEntry[] = [];
  private isProcessing = false;
  private localStorageKey = 'trace-dock-fallback-logs';
  private _enabled: boolean;

  constructor(options: TransportOptions) {
    this.endpoint = options.endpoint;
    this.maxRetries = options.maxRetries;
    this.onError = options.onError;
    this._enabled = options.enabled ?? true;
    
    // Only try to send stored logs if enabled
    if (this._enabled) {
      this.flushStoredLogs();
    }
  }

  /**
   * Enable the transport
   */
  enable(): void {
    this._enabled = true;
    // Flush any stored logs when re-enabled
    this.flushStoredLogs();
  }

  /**
   * Disable the transport
   */
  disable(): void {
    this._enabled = false;
  }

  /**
   * Check if the transport is enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  async send(log: LogEntry): Promise<boolean> {
    if (!this._enabled) {
      return true; // Silently skip when disabled
    }
    this.queue.push(log);
    return this.processQueue();
  }

  async sendBatch(logs: LogEntry[]): Promise<boolean> {
    if (!this._enabled) {
      return true; // Silently skip when disabled
    }
    this.queue.push(...logs);
    return this.processQueue();
  }

  private async processQueue(): Promise<boolean> {
    if (this.isProcessing || this.queue.length === 0) {
      return true;
    }

    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const log = this.queue[0];
      const success = await this.sendWithRetry(log);
      
      if (success) {
        this.queue.shift();
      } else {
        // Store in local storage for later retry
        this.storeLocally(log);
        this.queue.shift();
      }
    }

    this.isProcessing = false;
    return true;
  }

  private async sendWithRetry(log: LogEntry): Promise<boolean> {
    let attempts = 0;
    
    while (attempts < this.maxRetries) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: safeStringify(log),
        });

        if (response.ok) {
          return true;
        }

        // If server error, retry
        if (response.status >= 500) {
          attempts++;
          await this.delay(Math.pow(2, attempts) * 100);
          continue;
        }

        // Client error, don't retry
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        this.onError?.(error);
        return false;
      } catch (error) {
        attempts++;
        if (attempts >= this.maxRetries) {
          this.onError?.(error instanceof Error ? error : new Error(String(error)));
          return false;
        }
        await this.delay(Math.pow(2, attempts) * 100);
      }
    }

    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private storeLocally(log: LogEntry): void {
    try {
      if (typeof localStorage === 'undefined') return;
      
      const stored = localStorage.getItem(this.localStorageKey);
      const logs: LogEntry[] = stored ? JSON.parse(stored) : [];
      logs.push(log);
      
      // Keep only last 100 logs
      if (logs.length > 100) {
        logs.splice(0, logs.length - 100);
      }
      
      localStorage.setItem(this.localStorageKey, JSON.stringify(logs));
    } catch {
      // Ignore storage errors
    }
  }

  private async flushStoredLogs(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;
      
      const stored = localStorage.getItem(this.localStorageKey);
      if (!stored) return;
      
      const logs: LogEntry[] = JSON.parse(stored);
      localStorage.removeItem(this.localStorageKey);
      
      for (const log of logs) {
        await this.send(log);
      }
    } catch {
      // Ignore errors
    }
  }
}

/**
 * WebSocket Transport for real-time log streaming
 */
export class WebSocketTransport {
  private ws: WebSocket | null = null;
  private endpoint: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private queue: LogEntry[] = [];
  private onError?: (error: Error) => void;

  constructor(endpoint: string, onError?: (error: Error) => void) {
    this.endpoint = endpoint;
    this.onError = onError;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(this.endpoint);
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.flushQueue();
      };

      this.ws.onclose = () => {
        this.attemptReconnect();
      };

      this.ws.onerror = (event) => {
        this.onError?.(new Error(`WebSocket error: ${event}`));
      };
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  send(log: LogEntry): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(safeStringify(log));
    } else {
      this.queue.push(log);
    }
  }

  private flushQueue(): void {
    while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const log = this.queue.shift()!;
      this.ws.send(safeStringify(log));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onError?.(new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
