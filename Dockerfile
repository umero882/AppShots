# ---- build stage: compile the SPA ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run stage: tiny, dependency-free Node server ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Only what the runtime needs: built SPA, the proxy server, the shared pure
# helpers it imports, and package.json (for "type": "module"). No node_modules.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/lib/aiCore.js ./src/lib/aiCore.js
COPY package.json ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/index.js"]
