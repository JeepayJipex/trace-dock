import { ref, onMounted, onUnmounted } from 'vue';
import type { LogEntry } from '@/types';

interface WebSocketMessage {
  type: 'connected' | 'log';
  data?: LogEntry;
  message?: string;
  timestamp?: string;
}

// WebSocket URL configurable via env variable
function getWebSocketUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  
  // If it's a relative path (e.g., /api), use current host
  if (baseUrl.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // For /api, WebSocket is at /live (nginx proxies it)
    return `${protocol}//${window.location.host}/live`;
  }
  
  // Convert http(s) to ws(s)
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  return `${wsUrl}/live`;
}

export function useWebSocket(onLog: (log: LogEntry) => void) {
  const isConnected = ref(false);
  const isLiveMode = ref(true);
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;

  const connect = () => {
    const wsUrl = getWebSocketUrl();

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected');
        isConnected.value = true;
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'log' && message.data && isLiveMode.value) {
            onLog(message.data);
          }
        } catch (error) {
          console.error('[WS] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        isConnected.value = false;
        attemptReconnect();
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };
    } catch (error) {
      console.error('[WS] Failed to connect:', error);
      attemptReconnect();
    }
  };

  const attemptReconnect = () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('[WS] Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
    
    reconnectTimeout = setTimeout(() => {
      connect();
    }, delay);
  };

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    if (ws) {
      ws.close();
      ws = null;
    }
  };

  const toggleLiveMode = () => {
    isLiveMode.value = !isLiveMode.value;
  };

  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    isLiveMode,
    toggleLiveMode,
    connect,
    disconnect,
  };
}
