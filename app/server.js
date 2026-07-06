const { createServer } = require("http");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- this file is a plain CJS Node entrypoint, same as the requires above/below
const dgram = require("dgram");
const next = require("next");
const { WebSocketServer } = require("ws");

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

function isRestrictedHost(hostHeader) {
  if (!hostHeader) return false;
  const hostname = hostHeader.split(":")[0].toLowerCase();
  return !LOCALHOST_HOSTNAMES.has(hostname);
}

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
    // Next's request handler expects the legacy url.parse()-shaped object
    // (pathname/query/search, etc.), not a WHATWG URL instance — build that
    // shape using the modern URL API instead of the deprecated url.parse()
    // (see Node's DEP0169: url.parse() is inconsistent/unsafe on malformed
    // input in ways new URL() is not).
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (isRestrictedHost(req.headers.host) && !isPubliclyAllowedPath(parsedUrl.pathname)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("404 Not Found");
      return;
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
  });
});
