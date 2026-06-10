# syntax=docker/dockerfile:1
# =============================================================================
# Shared dependency stage
# =============================================================================
FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/email/package.json ./packages/email/
COPY packages/db/package.json ./packages/db/
COPY packages/authorization/package.json ./packages/authorization/

RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# =============================================================================
# Server target
# =============================================================================
FROM oven/bun:1.3.14-alpine AS server
WORKDIR /app

LABEL org.opencontainers.image.title="app-server" \
      org.opencontainers.image.description="Application API server"

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY packages/email ./packages/email
COPY packages/db ./packages/db
COPY packages/authorization ./packages/authorization
RUN rm -rf ./apps/server/node_modules ./packages/shared/node_modules ./packages/email/node_modules ./packages/db/node_modules ./packages/authorization/node_modules

RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 --ingroup bunjs bunapp

RUN chown -R bunapp:bunjs /app

WORKDIR /app/apps/server
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/status || exit 1

USER bunapp

CMD ["bun", "run", "src/index.ts"]

# =============================================================================
# Web build stage (intermediate -- not a final target)
# =============================================================================
FROM oven/bun:1.3.14-alpine AS web-build
WORKDIR /app

ARG VITE_SERVER_URL
ARG VITE_ENABLE_SIGNUP

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY tsconfig.json ./

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN rm -rf ./apps/web/node_modules ./packages/shared/node_modules

# openapi-ts reads the cached OpenAPI spec from apps/server
COPY apps/server/openapi.cache.json ./apps/server/openapi.cache.json

WORKDIR /app/apps/web

ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV VITE_ENABLE_SIGNUP=$VITE_ENABLE_SIGNUP
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile && bun run generate-client && bun run build

# =============================================================================
# Caddy target (serves web SPA + reverse proxies API services)
# =============================================================================
FROM caddy:2-alpine AS caddy

LABEL org.opencontainers.image.title="app-web" \
      org.opencontainers.image.description="Application web frontend"

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/apps/web/dist /srv/web

EXPOSE 80 443
