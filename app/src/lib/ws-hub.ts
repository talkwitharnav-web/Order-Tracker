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
  __orderTrackerAdminWsClients?: Set<WebSocket>;
};

const clients = globalForWs.__orderTrackerWsClients ?? new Set<ClientEntry>();
globalForWs.__orderTrackerWsClients = clients;

/**
 * Separate from `clients` above: an admin session is authenticated (see
 * server.js's /ws upgrade handler, which verifies admin_session before
 * registering here) and is the one legitimate case that needs to see EVERY
 * restaurant's order activity at once, unlike the restaurant-scoped
 * customer/kitchen sockets in `clients` (see SECURITY_ATTACK_LOG.md F7) --
 * so this is a distinct set rather than a wildcard restaurantName on the
 * existing scoped path, keeping the "every socket must declare one
 * restaurant" invariant intact for the unauthenticated path.
 */
const adminClients = globalForWs.__orderTrackerAdminWsClients ?? new Set<WebSocket>();
globalForWs.__orderTrackerAdminWsClients = adminClients;

export function registerClient(ws: WebSocket, restaurantName: string) {
  const entry: ClientEntry = { ws, restaurantName: restaurantName.toLowerCase() };
  clients.add(entry);
  ws.on("close", () => clients.delete(entry));
}

export function registerAdminClient(ws: WebSocket) {
  adminClients.add(ws);
  ws.on("close", () => adminClients.delete(ws));
}

export type OrderEvent =
  | { type: "order_updated"; payload: Record<string, unknown> & { restaurant_name?: string } }
  | { type: "order_deleted"; payload: { id: number; restaurant_name?: string } };

/**
 * Registration creates a row no existing socket is scoped to yet (a brand
 * new restaurant name), so it can't reuse `broadcast()`'s per-restaurant
 * targeting the way order events do -- there's no restaurant-scoped client
 * that could even be listening for it. Sent to admin sockets only, the same
 * "sees every restaurant's activity" channel `broadcast()` already fans
 * order events out to, so /admin/db's kitchen list can refresh live instead
 * of needing a manual tab reload.
 */
export function broadcastRestaurantCreated() {
  const message = JSON.stringify({ type: "restaurant_created" });
  for (const ws of adminClients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(message);
      } catch {
        adminClients.delete(ws);
      }
    } else {
      adminClients.delete(ws);
    }
  }
}

/**
 * Same no-payload/admin-only shape as broadcastRestaurantCreated() above, for
 * the identical reason: a submitted issue report isn't part of any
 * currently-loaded window a client could patch in place, so the fix is just
 * triggering /admin/issues's existing reload() rather than threading a full
 * row payload through. Called from POST /api/issues (a PUBLIC, unauthenticated
 * route) -- safe to call unconditionally since this only ever reaches admin
 * sockets, never the public reporter's own connection.
 */
export function broadcastIssueReported() {
  const message = JSON.stringify({ type: "issue_reported" });
  for (const ws of adminClients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(message);
      } catch {
        adminClients.delete(ws);
      }
    } else {
      adminClients.delete(ws);
    }
  }
}

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
      // ws.send() can throw synchronously (e.g. the underlying socket was
      // torn down between the readyState check and the call). One bad
      // client shouldn't stop every other subscribed client from receiving
      // this broadcast, so isolate the failure per-client instead of
      // letting it escape the loop.
      try {
        client.ws.send(message);
      } catch {
        clients.delete(client);
      }
    } else {
      clients.delete(client);
    }
  }

  // Admin sees every restaurant's order events -- this is the one channel
  // deliberately NOT scoped to a single restaurantName (see registerAdminClient).
  for (const ws of adminClients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(message);
      } catch {
        adminClients.delete(ws);
      }
    } else {
      adminClients.delete(ws);
    }
  }
}
