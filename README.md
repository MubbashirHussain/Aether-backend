# Aether Downloader Backend

Premium high-performance social media video downloader backend layer. Provides REST API endpoints for analyzing, caching, and serving downloadable video content from Instagram, TikTok, YouTube, and Facebook.

## Tech Stack

- **Runtime**: Node.js 24
- **Framework**: Hono (lightweight HTTP framework)
- **Language**: TypeScript (ESNext/NodeNext module resolution)
- **Validation**: Zod schema validation
- **Logging**: Pino structured logging
- **External**: yt-dlp for media extraction, ffmpeg for processing

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run start` | Run compiled production build |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /api/download | Analyze a video URL |
| POST | /api/download/session | Start download session |
| POST | /api/download/unlock | Unlock download after interstitial |
| GET | /api/ads/config | Get ad placement configuration |
| POST | /api/analytics | Track analytics event |
| GET | /api/analytics/stats | Get analytics metrics |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NODE_ENV | development | Environment mode |
| CORS_ORIGIN | * | Allowed CORS origin |
| CACHE_TTL_MINUTES | 30 | Metadata cache TTL |
| RATE_LIMIT_REQUESTS | 20 | Requests per window |
| RATE_LIMIT_WINDOW_MINUTES | 1 | Rate limit window |
| MAX_CONCURRENT_JOBS | 3 | Max concurrent yt-dlp processes |
| YTDLP_TIMEOUT_MS | 30000 | yt-dlp timeout |
| DOWNLOAD_UNLOCK_SECONDS | 5 | Interstitial unlock delay |
