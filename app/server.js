const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const clients = globalThis.__orderTrackerWsClients ?? new Set();
globalThis.__orderTrackerWsClients = clients;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (pathname === "/ws") {
      // Reject WS upgrades from other origins — broadcasts contain live order
      // data for every restaurant, so this stops arbitrary external sites
      // from connecting and passively listening in (not full per-restaurant
      // auth, but closes the "any random site" attack surface cheaply).
      const origin = req.headers.origin;
      const allowedHost = req.headers.host;
      if (origin && allowedHost) {
        let originHost;
        try {
          originHost = new URL(origin).host;
        } catch {
          originHost = null;
        }
        if (originHost !== allowedHost) {
          socket.destroy();
          return;
        }
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
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
