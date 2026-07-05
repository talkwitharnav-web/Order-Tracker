import type { WebSocket } from "ws";

/**
 * Each connected client is scoped to the one restaurant it's tracking (see
 * SECURITY_ATTACK_LOG.md F7). The customer tracker is intentionally
 * anonymous -- there is no login to gate a WS connection behind -- so
 * instead of authenticating the socket, we scope what it CAN receive to the
 * restaurant name the client already provided when it started tracking an
 * order. This means a listener can only ever learn about the one
 * restaurant's orders it already knew the name of (the same information
 * already obtainable via the public /api/orders/search lookup), not every
 * restaurant's live order stream.
 */
type ClientEntry = { ws: WebSocket; restaurantName: string };

const globalForWs = globalThis as unknown as {
  __orderTrackerWsClients?: Set<ClientEntry>;
};

const clients = globalForWs.__orderTrackerWsClients ?? new Set<ClientEntry>();
globalForWs.__orderTrackerWsClients = clients;

export function registerClient(ws: WebSocket, restaurantName: string) {
  const entry: ClientEntry = { ws, restaurantName: restaurantName.toLowerCase() };
  clients.add(entry);
  ws.on("close", () => clients.delete(entry));
}

export type OrderEvent =
  | { type: "order_updated"; payload: Record<string, unknown> & { restaurant_name?: string } }
  | { type: "order_deleted"; payload: { id: number; restaurant_name?: string } };

/**
 * Broadcasts to every client subscribed to the event's restaurant_name.
 * `order_deleted` events historically only carried an id (see ws-hub's
 * previous shape) -- callers should pass restaurant_name through for both
 * event types now so this can actually scope delivery; if it's missing,
 * the event is dropped rather than sent to everyone (fail closed, not open).
 */
export function broadcast(event: OrderEvent) {
  const restaurantName = event.payload.restaurant_name;
  if (!restaurantName) return;

  const targetName = restaurantName.toLowerCase();
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.restaurantName !== targetName) continue;
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(message);
    } else {
      clients.delete(client);
    }
  }
}
