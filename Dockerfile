# syntax=docker/dockerfile:1
FROM docker.io/library/node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl tini \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

FROM dependencies AS build
COPY . .
RUN mkdir -p public && npm run build
# Prisma CLI and tsx are production dependencies for maintenance in Easypanel.
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

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
COPY --from=build --chown=node:node /app/scripts/start-container.mjs /app/scripts/container-healthcheck.mjs ./scripts/

# Fail the image build if required runtime tools did not survive pruning.
RUN node --check server.js \
    && node -e "for (const name of ['next', 'sharp', 'tsx', '@prisma/adapter-pg']) require.resolve(name)" \
    && node --check node_modules/prisma/build/index.js

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD ["node", "scripts/container-healthcheck.mjs"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/start-container.mjs"]
