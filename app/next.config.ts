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
  // current address.
  allowedDevOrigins: ["192.168.12.140"],
  // Turns off the floating dev-mode corner badge (route/build indicator) --
  // purely a dev-UI preference, no effect on production builds either way.
  devIndicators: false,
};

export default nextConfig;
