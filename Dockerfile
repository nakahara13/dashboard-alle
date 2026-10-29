# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN mkdir -p public && npm run build
# Prisma CLI and tsx are production dependencies for maintenance in Easypanel.
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Keep production dependencies so migrations and admin bootstrap work in Shell.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/standalone/server.js ./server.js
COPY --from=build --chown=node:node /app/.next/standalone/.next ./.next
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/src/generated/prisma ./src/generated/prisma
COPY --from=build --chown=node:node /app/src/lib/password.ts ./src/lib/password.ts
COPY --from=build --chown=node:node /app/scripts/bootstrap-admin.ts /app/scripts/check-db.mjs ./scripts/

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/login', { redirect: 'manual', signal: AbortSignal.timeout(4000) }).then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
