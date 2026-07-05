const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Shared with src/lib/ws-hub.ts via globalThis (same process, see
// SYSTEM_MEMORY.md §8 on why this only works single-instance). Each entry
// now also carries the restaurant name the client is subscribed to (see
// SECURITY_ATTACK_LOG.md F7) -- broadcast() in ws-hub.ts only delivers an
// event to clients whose restaurantName matches the event's, instead of
// blasting every connected socket regardless of which restaurant it asked
// about.
const clients = globalThis.__orderTrackerWsClients ?? new Set();
globalThis.__orderTrackerWsClients = clients;

// Per-IP cap on concurrent /ws connections (see SECURITY_ATTACK_LOG.md F7) —
// bounds how many passive listener sockets a single caller can hold open.
const MAX_WS_CONNECTIONS_PER_IP = 5;
const wsConnectionsByIp = new Map(); // ip -> count

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // This is a bare Node server with no reverse proxy in front of it, so
    // there is nobody upstream stripping/overwriting a client-supplied
    // X-Forwarded-For header. The rate limiter (src/lib/rate-limit.ts) reads
    // that header to key attempts per-IP; trusting it unconditionally let a
    // caller spoof a fresh IP on every request and bypass the limiter
    // entirely (SECURITY_ATTACK_LOG.md F3). Overwrite it here with the real
    // TCP remote address before Next's handler (and any API route) ever
    // sees it, so route code can keep reading the header but can no longer
    // be lied to by the client.
    req.headers["x-forwarded-for"] = req.socket.remoteAddress || "unknown";
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, ip, restaurantName) => {
    const entry = { ws, restaurantName: restaurantName.toLowerCase() };
    clients.add(entry);
    wsConnectionsByIp.set(ip, (wsConnectionsByIp.get(ip) || 0) + 1);
    ws.on("close", () => {
      clients.delete(entry);
      const next = (wsConnectionsByIp.get(ip) || 1) - 1;
      if (next <= 0) wsConnectionsByIp.delete(ip);
      else wsConnectionsByIp.set(ip, next);
    });
  });

  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url, true);

    if (pathname === "/ws") {
      // Every connection must declare which restaurant it's tracking (see
      // SECURITY_ATTACK_LOG.md F7) -- broadcast() then only delivers events
      // for that restaurant to this socket. A connection with no restaurant
      // param has nothing to subscribe to and is rejected outright, closing
      // off the previous "connect and receive every restaurant's live order
      // stream" eavesdropping surface.
      const restaurantName = typeof query.restaurant === "string" ? query.restaurant.trim() : "";
      if (!restaurantName) {
        socket.destroy();
        return;
      }

      // Reject WS upgrades from other origins — broadcasts contain live order
      // data for every restaurant, so this stops arbitrary sites (and,
      // crucially, non-browser clients that omit Origin entirely) from
      // connecting and passively listening in. Browsers always send Origin
      // on a WS handshake; a missing Origin means a non-browser caller, not
      // a legitimate same-origin page, so it's rejected too now (previously
      // the check only ran when Origin was present, which let any script
      // that simply didn't set the header straight through — see
      // SECURITY_ATTACK_LOG.md F7).
      const origin = req.headers.origin;
      const allowedHost = req.headers.host;
      let originHost = null;
      if (origin) {
        try {
          originHost = new URL(origin).host;
        } catch {
          originHost = null;
        }
      }
      if (!origin || !allowedHost || originHost !== allowedHost) {
        socket.destroy();
        return;
      }

      const ip = req.socket.remoteAddress || "unknown";
      if ((wsConnectionsByIp.get(ip) || 0) >= MAX_WS_CONNECTIONS_PER_IP) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, ip, restaurantName);
      });
    } else {
      // Delegate everything else (e.g. Next's dev-mode HMR websocket) to Next.
      nextUpgradeHandler(req, socket, head);
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port} (ws endpoint: /ws)`);
  });
});
