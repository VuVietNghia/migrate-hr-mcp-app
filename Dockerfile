FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
# Patch base-image openssl (CVE-2026-14456: libcrypto3/libssl3, fixed in 3.5.8-r0)
RUN apk --no-cache upgrade libcrypto3 libssl3 \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/privos-app.json ./privos-app.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public
ARG PRIVOS_MCP_MANIFEST_JSON
ARG PRIVOS_MCP_MANIFEST_DIGEST
LABEL io.privos.mcp.manifest="${PRIVOS_MCP_MANIFEST_JSON}" \
      io.privos.mcp.manifest-digest="${PRIVOS_MCP_MANIFEST_DIGEST}"
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/ready" >/dev/null || exit 1
CMD ["node_modules/.bin/tsx", "src/server.ts"]
