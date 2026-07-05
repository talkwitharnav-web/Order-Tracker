# Restaurant app image.
#
# This mirrors how the app runs locally: `npm run build` then `node server.js`
# (a custom server, NOT `next start` -- see CLAUDE.md/SYSTEM_MEMORY.md for why
# a custom server is required here: it attaches a raw WebSocket upgrade
# handler that the Next.js App Router alone can't host).
#
# This does NOT bundle Postgres -- the container expects DATABASE_URL to
# point at a reachable Postgres instance (e.g. the docker-compose.yml
# Postgres service, or any other Postgres). See the "docker-export" script's
# printed instructions for exactly how to run this alongside Postgres.

FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# This app currently has no public/ directory (unused Next.js starter assets
# were removed from it -- see CLAUDE.md's cleanup history). Ensure it exists
# so the COPY into the runner stage below always has something valid to copy,
# even if that ever changes back in either direction.
RUN mkdir -p public
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js

EXPOSE 3000
CMD ["node", "server.js"]
