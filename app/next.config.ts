import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's dev server (assets, HMR websocket) only trusts requests whose
  // Origin matches "localhost"/the configured hostname by default -- a
  // phone or another device on the LAN loads the page via the machine's
  // real network IP instead, which without this allowlist causes the dev
  // client's HMR websocket to fail silently and the page to never finish
  // hydrating (React renders the shell, then never mounts real content).
  // This must be a literal hostname/IP or a `*.`-prefixed wildcard domain --
  // Next does NOT support CIDR ranges here. Only used in dev; harmless/
  // unused in a production build. If your PC's LAN IP changes (DHCP lease
  // renewal, different network), update this to match -- run `node server.js`
  // and check its "Also reachable on your network at ..." log line for the
  // current address. Both machines this project moves between are listed:
  // .140 is the main host, .141 is the Windows auditing box.
  allowedDevOrigins: ["192.168.12.140", "192.168.12.141"],
  // Turns off the floating dev-mode corner badge (route/build indicator) --
  // purely a dev-UI preference, no effect on production builds either way.
  devIndicators: false,
  // Removes the `X-Powered-By: Next.js` response header -- pure
  // fingerprinting reduction (an attacker can already tell this is Next.js
  // from bundle URLs/HTML structure), but there's no reason to hand it over
  // for free in a header (see SECURITY_ATTACK_LOG.md).
  poweredByHeader: false,
  // Browser source maps are only ever emitted in a dev build (`next dev` /
  // `node server.js` with NODE_ENV !== "production") -- a real `next build`
  // production bundle does not ship them regardless of this setting. Setting
  // it explicitly documents the intent and guards against a future
  // config change accidentally re-enabling them in production, rather than
  // relying on the framework default alone (see SECURITY_ATTACK_LOG.md's
  // "Source Maps Exposed" finding, which was observed against the dev
  // server -- this app has never actually been run via `next build && next
  // start`; server.js always calls next({ dev: NODE_ENV !== "production" })).
  productionBrowserSourceMaps: false,
  // Baseline security headers applied to every response. CSP is
  // deliberately permissive on script/style (`'unsafe-inline'`) rather than
  // a strict nonce-based policy, since this app has no build step that
  // injects per-request nonces into inline <script>/<style> tags (the theme-
  // init script in layout.tsx runs inline, Tailwind emits inline style attrs)
  // -- a strict CSP would break real functionality here, not just theoretical
  // risk. Even a same-origin-only CSP still meaningfully blocks a stored-XSS
  // payload from exfiltrating data to an attacker-controlled domain (no
  // connect-src/img-src to arbitrary hosts), which is the actual risk this
  // app's stored-name fields present (see SECURITY_ATTACK_LOG.md).
  async headers() {
    // Next's dev mode (React DevTools call-stack reconstruction, HMR) uses
    // eval() internally -- confirmed by a real console error the first time
    // this CSP was added without this exception ("eval() is not supported in
    // this environment... make sure unsafe-eval is included"). React itself
    // guarantees it never uses eval() in a production build, so this
    // widening is scoped to dev only and doesn't apply to a real `next
    // build` production bundle.
    const isDev = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // Strict-Transport-Security deliberately NOT set here: this app is
          // plain HTTP on a home LAN today, and HSTS is a browser promise to
          // only ever connect via HTTPS from now on -- sending it prematurely
          // (before a real reverse proxy/TLS termination exists, see the
          // router/public-exposure readiness notes in server.js) could lock
          // a visiting browser out of the plain-HTTP LAN address entirely.
          // Add `{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }`
          // once this is actually served over HTTPS, not before.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self' ws: wss:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
