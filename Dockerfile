# syntax=docker/dockerfile:1
#
# VELORA in one container: API (port 4000) + storefront & owner portal (port 3000).
# Use this on hosts that keep a server running (Render, Railway, Fly.io, a VPS…):
# live updates (Socket.IO) and background jobs work here. For Vercel, see vercel.json.
#
# ── Build ────────────────────────────────────────────────────────────────────
#   docker build -t velora \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://yourdomain.com .
#
#   NEXT_PUBLIC_* values are baked into the storefront at build time, so rebuild
#   the image if your domains change. Locally the defaults (localhost) are fine.
#
# ── Run ──────────────────────────────────────────────────────────────────────
#   docker run -d --name velora -p 3000:3000 -p 4000:4000 \
#     --env-file backend/.env \
#     -e CLIENT_URL=https://yourdomain.com \
#     -e API_PUBLIC_URL=https://api.yourdomain.com \
#     -e CORS_ORIGINS=https://yourdomain.com \
#     velora
#
# Secrets are NEVER copied into the image (.dockerignore excludes every .env file);
# pass them at run time. Required: MONGODB_URI, SESSION_SECRET (32+ characters).
# For checkout and the owner account: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
# ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME. For real emails: EMAIL_TRANSPORT=smtp,
# SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM.
# Full list with explanations: backend/.env.example and docs/DEPLOYMENT.md.

ARG NODE_VERSION=24

# ── API: install, compile TypeScript, keep only runtime packages ──────────────
FROM node:${NODE_VERSION}-bookworm-slim AS api
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ── Storefront + owner portal: production Next.js build ──────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json ./
COPY scripts/dev.mjs scripts/dev.mjs

COPY --from=api /app/backend/package.json backend/package.json
COPY --from=api /app/backend/node_modules backend/node_modules
COPY --from=api /app/backend/dist backend/dist
# Demo catalogue photos, used to seed an empty database on first start (SEED_ON_START).
COPY --from=api /app/backend/src/seed/assets backend/src/seed/assets

COPY --from=web /app/frontend/package.json frontend/package.json
COPY --from=web /app/frontend/next.config.ts frontend/next.config.ts
COPY --from=web /app/frontend/node_modules frontend/node_modules
COPY --from=web /app/frontend/public frontend/public
COPY --from=web --chown=node:node /app/frontend/.next frontend/.next

USER node
EXPOSE 3000 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Starts the API and the storefront together; the container stops if either one stops.
CMD ["node", "scripts/dev.mjs", "--prod"]
