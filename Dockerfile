# Mock suite image (spec §8). Runs offline once built: everything it needs is inside.

# Stage 1: build the React screens (web/dist).
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts ./
COPY web/ ./web/
RUN npm run build:web

# Stage 2: compile the TypeScript server (dist/).
FROM node:20-alpine AS server
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 3: runtime with production dependencies only.
FROM node:20-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=server /app/dist ./dist
COPY --from=web /app/web/dist ./web/dist
# dist/ resolves ../seed and ../config, so both sit next to it (compose mounts them read-only).
COPY seed/ ./seed/
COPY config/ ./config/
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "dist/server.js"]
