import type { LogEntry } from './schemas';

interface WSClient {
  send: (data: string) => void;
  readyState: number;
}

class WebSocketManager {
  private clients: Set<WSClient> = new Set();

  addClient(ws: WSClient): void {
    this.clients.add(ws);
    console.log(`[WS] Client connected. Total clients: ${this.clients.size}`);
  }

  removeClient(ws: WSClient): void {
    this.clients.delete(ws);
    console.log(`[WS] Client disconnected. Total clients: ${this.clients.size}`);
  }

  broadcast(log: LogEntry): void {
    const message = JSON.stringify({
      type: 'log',
      data: log,
    });

    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // OPEN
          client.send(message);
        }
      } catch (error) {
        console.error('[WS] Error broadcasting to client:', error);
        this.removeClient(client);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const wsManager = new WebSocketManager();
