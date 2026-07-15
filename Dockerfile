FROM node:24-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src
RUN npm run build

FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    && pip3 install --break-system-packages -U yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json tsconfig.json ./

RUN addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --ingroup app app \
    && mkdir -p /tmp/aether-downloads \
    && chown -R app:app /app /tmp/aether-downloads

USER app

EXPOSE 10000

ENV PORT=10000 \
    NODE_ENV=production \
    TEMP_DIR=/tmp/aether-downloads

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:10000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
