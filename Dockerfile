# ---- build stage: compile the SPA ----
# Node 22: Vite 8 requires Node >=20.19 || >=22.12; pin 22 so the build is stable.
FROM node:22-alpine AS build
# VITE_* vars are inlined into the bundle at build time, so they must be present
# HERE (as build args), not just at runtime. The Supabase anon key is public
# (RLS-protected) — safe to ship in the client. Set these as BUILD variables in
# Coolify. The proxy keys (ANTHROPIC_API_KEY etc.) are runtime-only — NOT here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
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
