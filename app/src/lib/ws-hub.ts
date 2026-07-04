import type { WebSocket } from "ws";

const globalForWs = globalThis as unknown as {
  __orderTrackerWsClients?: Set<WebSocket>;
};

const clients = globalForWs.__orderTrackerWsClients ?? new Set<WebSocket>();
globalForWs.__orderTrackerWsClients = clients;

export function registerClient(ws: WebSocket) {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
}

export type OrderEvent =
  | { type: "order_updated"; payload: Record<string, unknown> }
  | { type: "order_deleted"; payload: { id: number } };

export function broadcast(event: OrderEvent) {
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    } else {
      clients.delete(client);
    }
  }
}
