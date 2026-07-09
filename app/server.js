const { createServer } = require("http");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- this file is a plain CJS Node entrypoint, same as the requires above/below
const dgram = require("dgram");
const next = require("next");
const { WebSocketServer } = require("ws");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see the dgram require above
const { startBackupSchedule } = require("./scripts/db-backup");

// True for an IPv4 address in one of the private/LAN ranges (10.0.0.0/8,
// 172.16.0.0/12, 192.168.0.0/16) or a Node-reported IPv4-mapped-IPv6 form of
// one of those ("::ffff:192.168.1.5", which is how req.socket.remoteAddress
// often reports an IPv4 peer on a dual-stack socket). Used to allow the
// Origin-less WebSocket handshake a non-browser client (the Expo/React
// Native app) sends -- browsers always send Origin, so a request with none
// at all is either a same-network trusted dev client or a random internet
// script; restricting the exception to private-range source IPs keeps the
// public-internet protection intact (see the Origin check below) while
// unblocking the one legitimate non-browser case this app now has.
function isPrivateLanIp(address) {
  if (!address) return false;
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

// Determines the real WiFi/Ethernet LAN IP to print at startup -- printing
// "0.0.0.0" (what the server actually binds to) would be useless as an
// address to visit from another device, since 0.0.0.0 isn't a real reachable
// address, just "listen on every interface". A dev machine commonly has
// several *other* non-internal IPv4 adapters too (VirtualBox host-only,
// Hyper-V/WSL virtual switches, VPN clients) that are NOT reachable from a
// phone on the same WiFi -- os.networkInterfaces() exposes no reliable way
// to tell those apart from the real LAN adapter (adapter *names* are not a
// reliable signal: a VirtualBox host-only adapter on this machine is
// literally named "Ethernet 4", indistinguishable by name from a real
// Ethernet/WiFi adapter). Instead, this opens a UDP "connection" to a public
// address (no packets are actually sent -- UDP connect() is just a local
// routing-table lookup) and reads back which local address the OS would
// route through to reach the internet, which is always the real LAN-facing
// adapter, not a virtual one.
function getLanAddress() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    socket.once("error", () => {
      socket.close();
      resolve(null);
    });
    try {
      socket.connect(80, "8.8.8.8", () => {
        const address = socket.address().address;
        socket.close();
        resolve(address);
      });
    } catch {
      resolve(null);
    }
  });
}

// Rehearsal for the eventual real public split (see MOBILE_MIGRATION_PLAN.md /
// CLAUDE.md): visiting the server via localhost gets the full app (gateway,
// admin/db, everything); visiting via any OTHER Host (the LAN IP today, a
// real public subdomain later via Cloudflare Tunnel) only exposes the
// customer tracker and kitchen portal -- bare "/" and admin/db 404 on that
// host, "for public" is simulated locally before it's actually public. This
// is genuinely the same mechanism a real deployment would use (checking the
// Host/domain on each request), just keyed on a raw IP for now instead of a
// real subdomain.
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Path prefixes a non-localhost Host is allowed to reach. Must include not
// just the public-facing pages themselves but every API route those pages'
// client-side code calls, and Next's own internal asset/runtime paths --
// blocking those wouldn't hide anything extra, it would just break the
// allowed pages (no CSS/JS, no session check, etc).
const PUBLIC_ALLOWED_PREFIXES = [
  "/customer",
  "/restaurant",
  "/api/orders",
  "/api/restaurants",
  "/api/session",
  "/api/logout",
  "/api/health",
  "/_next",
  "/favicon.ico",
];

// Themed 404 body for the pre-Next host gate above -- this response never
// touches Next's router (that's the whole point of the gate: don't even let
// a LAN/public visitor probe whether an admin-only path exists), so it can't
// reuse React components. Plain self-contained HTML/CSS instead, matching
// globals.css's warm-bistro tokens by hand (light + dark via
// prefers-color-scheme, since there's no client-side theme toggle here).
// Kitchen/Customer buttons mirror src/app/not-found.tsx's LAN branch -- keep
// both in sync if the copy/links ever change.
const RESTRICTED_HOST_404_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title>
<style>
  :root { --surface-0: #faf6ee; --surface-1: #ffffff; --border: #e8dcc6; --border-strong: #d8c6a3; --text-primary: #2b2320; --text-secondary: #6b5c4d; --brand: #c1602f; --brand-hover: #a34e23; }
  @media (prefers-color-scheme: dark) {
    :root { --surface-0: #211a15; --surface-1: #2b221c; --border: #3d3128; --border-strong: #4f4034; --text-primary: #f5ecdf; --text-secondary: #c9b8a4; --brand: #e07a45; --brand-hover: #ec9463; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1rem; background: var(--surface-0); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  main { width: 100%; max-width: 26rem; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 0.75rem; padding: 2.5rem 1.75rem; text-align: center; }
  .hat { font-size: 3rem; line-height: 1; margin-bottom: 0.5rem; }
  h1 { font-size: 1.75rem; font-weight: 600; margin: 0.5rem 0 0.5rem; }
  p { color: var(--text-secondary); font-size: 0.95rem; margin: 0 0 1.5rem; }
  .buttons { display: flex; flex-direction: column; gap: 0.75rem; }
  @media (min-width: 480px) { .buttons { flex-direction: row; } }
  a.btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.95rem; text-decoration: none; transition: background-color 0.15s ease; }
  a.btn-primary { background: var(--brand); color: #fff; }
  a.btn-primary:hover { background: var(--brand-hover); }
  a.btn-secondary { background: transparent; color: var(--text-primary); border: 1px solid var(--border-strong); }
  a.btn-secondary:hover { background: var(--border); }
</style>
</head>
<body>
<main>
  <div class="card">
    <div class="hat" aria-hidden="true">&#127859;</div>
    <h1>Page not found</h1>
    <p>That page doesn't exist, or moved somewhere else.</p>
    <div class="buttons">
      <a class="btn btn-primary" href="/restaurant/home">Kitchen</a>
      <a class="btn btn-secondary" href="/customer">Track an Order</a>
    </div>
  </div>
</main>
</body>
</html>
`;

function isRestrictedHost(hostHeader) {
  if (!hostHeader) return false;
  const hostname = hostHeader.split(":")[0].toLowerCase();
  return !LOCALHOST_HOSTNAMES.has(hostname);
}

// --- ROUTER/PUBLIC-EXPOSURE READINESS (not active) --------------------
// This Host-based branch already IS the real mechanism a public deployment
// would use (see the comment above PUBLIC_ALLOWED_PREFIXES) -- nothing here
// needs to change structurally to go from "LAN IP" to "real domain behind
// an open router port + Cloudflare Tunnel/reverse proxy". What DOES need to
// happen at that point (see CLAUDE.md's "public exposure prep" entry and
// MOBILE_MIGRATION_PLAN.md for the researched self-hosting path):
//
// 1. Behind a reverse proxy (Caddy/nginx via Cloudflare Tunnel), this server
//    only ever sees plain HTTP from the proxy, never HTTPS directly -- do
//    NOT try to terminate TLS in this file. Let the proxy handle that, this
//    server keeps listening on plain HTTP on the LAN side of the tunnel.
// 2. session cookies' `Secure` flag (session.ts's SESSION_COOKIE_SECURE,
//    read from an explicit FORCE_SECURE_COOKIES=true env var, NOT tied to
//    NODE_ENV -- see that file's comment for why) should be turned on once
//    this is genuinely served over HTTPS from the *browser's* point of
//    view -- true once the Cloudflare Tunnel + Caddy front end is in place,
//    since the browser always talks HTTPS to Cloudflare even though this
//    box speaks plain HTTP behind it. Do NOT set FORCE_SECURE_COOKIES=true
//    before that point -- it would make the browser refuse to ever send
//    the cookie back over the current plain-HTTP LAN connection.
// 3. Once a real reverse proxy sits in front of this server, X-Forwarded-For
//    handling (a few lines below) must trust the PROXY's header instead of
//    overwriting it with req.socket.remoteAddress -- otherwise every
//    request will appear to come from the proxy's own local IP and the
//    rate limiter/WS LAN-allowlist checks would misbehave. Only trust
//    X-Forwarded-For when the immediate connecting peer is the known
//    reverse-proxy address, never trust it directly from the open internet.
// 4. Swap/extend PUBLIC_ALLOWED_PREFIXES's Host check to the real public
//    domain instead of (or in addition to) the LAN IP.
// -----------------------------------------------------------------------

function isPubliclyAllowedPath(pathname) {
  return PUBLIC_ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`));
}

const dev = process.env.NODE_ENV !== "production";
// "0.0.0.0" (all network interfaces) instead of "localhost" so the server
// accepts connections from other devices on the LAN (a phone running the
// Expo/React Native app, another laptop/tablet for testing) -- "localhost"
// only accepts connections originating from this machine itself. Windows
// Firewall must also allow inbound traffic on `port` for this to actually
// be reachable from another device -- see USER_HELP.md.
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Safety net: an uncaught error/rejection anywhere (a route handler, a
// background timer, a WS callback) would otherwise crash this whole process
// and take down every in-flight request plus the WS hub with it. Logging and
// continuing is the right call for a single-process dev/hobby server with no
// process manager restarting it — better a logged error than a dead server.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server continuing):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server continuing):", reason);
});

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
// A restaurant's customers commonly share one public/NAT address, and a
// future reverse proxy may make every internet client appear to come from
// the proxy's own socket address. Five connections therefore cuts off normal
// customer traffic. Connections are read-only and restaurant-scoped, so a
// higher ceiling still bounds resource use without blocking a modest venue.
const MAX_WS_CONNECTIONS_PER_IP = 50;
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
    // ROUTER/PUBLIC-EXPOSURE READINESS (not active): the unconditional
    // overwrite below is only correct with NO reverse proxy in front of this
    // server, which is true today (LAN-direct). The moment a real reverse
    // proxy (Caddy/Cloudflare Tunnel) sits in front of this for public
    // exposure, req.socket.remoteAddress becomes the PROXY's own local
    // address for every request, not the real visitor -- this line would
    // need to instead trust the proxy's own X-Forwarded-For (only when the
    // immediate peer IS the known proxy address) rather than always
    // discarding it. Left unconditional here since there's no proxy yet.
    req.headers["x-forwarded-for"] = req.socket.remoteAddress || "unknown";
    // Next's request handler expects the legacy url.parse()-shaped object
    // (pathname/query/search, etc.), not a WHATWG URL instance — build that
    // shape using the modern URL API instead of the deprecated url.parse()
    // (see Node's DEP0169: url.parse() is inconsistent/unsafe on malformed
    // input in ways new URL() is not).
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (isRestrictedHost(req.headers.host) && !isPubliclyAllowedPath(parsedUrl.pathname)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(RESTRICTED_HOST_404_HTML);
      return;
    }

    // Every route in this app that reads a request body is a small JSON API
    // call (login/register/create-order/etc.) -- none legitimately need more
    // than a few hundred bytes. Without a limit, a caller could send an
    // arbitrarily large body that gets fully buffered into memory by
    // req.json() inside a route handler before that handler ever gets a
    // chance to validate/reject anything (see SECURITY_ATTACK_LOG.md's "No
    // Request Body Size Limit" finding -- a 100KB+ body was accepted with no
    // pushback). Checked at this layer (not per-route) so every current and
    // future API route gets the same protection automatically, rather than
    // relying on each route remembering to check it individually.
    const MAX_BODY_BYTES = 16 * 1024; // 16KB -- generous over the largest legitimate payload (a 200-char name/password pair) with headroom
    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Request body too large" }));
      return;
    }
    if (parsedUrl.pathname.startsWith("/api/") && !declaredLength) {
      // No Content-Length (e.g. chunked transfer-encoding) -- enforce the
      // same cap by counting bytes as they arrive and aborting the
      // connection if it's exceeded, instead of trusting a header that
      // wasn't sent.
      let received = 0;
      let aborted = false;
      req.on("data", (chunk) => {
        if (aborted) return;
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
          aborted = true;
          res.statusCode = 413;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Request body too large" }));
          req.destroy();
        }
      });
    }

    handle(req, res, {
      pathname: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams),
      search: parsedUrl.search,
    });
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
    const upgradeUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = upgradeUrl.pathname;
    const query = Object.fromEntries(upgradeUrl.searchParams);

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
      // on a WS handshake; a missing Origin means a non-browser caller, so
      // it's rejected too UNLESS the connection is coming from a private LAN
      // IP (see isPrivateLanIp above) -- that's the Expo/React Native mobile
      // app on the same home network, the one legitimate non-browser client
      // this app now has, and a random internet attacker can never appear to
      // originate from a private IP address (see SECURITY_ATTACK_LOG.md F7
      // for the original vulnerability this check closes).
      const ip = req.socket.remoteAddress || "unknown";
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
      const originOk = !!origin && !!allowedHost && originHost === allowedHost;
      const lanClientNoOrigin = !origin && isPrivateLanIp(ip);
      if (!originOk && !lanClientNoOrigin) {
        socket.destroy();
        return;
      }

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

  server.listen(port, hostname, async () => {
    console.log(`> Ready on http://localhost:${port} (ws endpoint: /ws)`);
    if (hostname === "0.0.0.0") {
      const lanAddress = await getLanAddress();
      if (lanAddress) {
        console.log(`> Also reachable on your network at http://${lanAddress}:${port}`);
      }
    }
    // Rolling DB backup safety net -- see scripts/db-backup.js. Started here
    // (not earlier in this file) so it only begins once the server is
    // actually up and Postgres has had a chance to be reachable, rather than
    // racing the very first request.
    startBackupSchedule();
  });
});
