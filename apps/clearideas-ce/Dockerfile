FROM node:24.15.0-alpine3.22 AS build
WORKDIR /usr/src/app

COPY packages/clearideas-contracts-core/package.json packages/clearideas-contracts-core/package.json
COPY packages/clearideas-core/package.json packages/clearideas-core/package.json
COPY apps/clearideas-ce/package.json apps/clearideas-ce/package.json
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --workspaces --include-workspace-root=false

COPY packages/clearideas-contracts-core packages/clearideas-contracts-core
COPY packages/clearideas-core packages/clearideas-core
COPY apps/clearideas-ce apps/clearideas-ce
COPY tsconfig.json tsconfig.json
RUN npm run -w @clearideas/contracts-core build && \
    npm run -w @clearideas/core build && \
    npm run -w @clearideas/ce build && \
    npm prune --omit=dev --workspaces

FROM node:24.15.0-alpine3.22
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs && \
    apk add --no-cache dumb-init ca-certificates

WORKDIR /usr/src/app
COPY --from=build --chown=nodejs:nodejs /usr/src/app/package.json ./
COPY --from=build --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /usr/src/app/packages/clearideas-contracts-core/package.json ./packages/clearideas-contracts-core/package.json
COPY --from=build --chown=nodejs:nodejs /usr/src/app/packages/clearideas-contracts-core/dist ./packages/clearideas-contracts-core/dist
COPY --from=build --chown=nodejs:nodejs /usr/src/app/packages/clearideas-core/package.json ./packages/clearideas-core/package.json
COPY --from=build --chown=nodejs:nodejs /usr/src/app/packages/clearideas-core/dist ./packages/clearideas-core/dist
COPY --from=build --chown=nodejs:nodejs /usr/src/app/apps/clearideas-ce/package.json ./apps/clearideas-ce/package.json
COPY --from=build --chown=nodejs:nodejs /usr/src/app/apps/clearideas-ce/dist ./apps/clearideas-ce/dist
COPY --from=build --chown=nodejs:nodejs /usr/src/app/apps/clearideas-ce/web ./apps/clearideas-ce/web
COPY --from=build --chown=nodejs:nodejs /usr/src/app/apps/clearideas-ce/templates ./apps/clearideas-ce/templates

RUN mkdir -p /usr/src/app/apps/clearideas-ce/data/storage /usr/src/app/apps/clearideas-ce/data/search && \
    chown -R nodejs:nodejs /usr/src/app/apps/clearideas-ce/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100
ENV STORAGE_ROOT=apps/clearideas-ce/data/storage
ENV SEARCH_INDEX_ROOT=apps/clearideas-ce/data/search
ENV EMAIL_PROVIDER=log

USER nodejs
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4100) + '/api/health', { headers: { 'x-forwarded-proto': 'https' } }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/clearideas-ce/dist/server.js"]
