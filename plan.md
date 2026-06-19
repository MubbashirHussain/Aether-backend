Aether Downloader - Complete Backend Master Specification (MVP v1)

This unified specification file contains the complete, production-ready implementation source code, configuration manifests, environment maps, and container setups for the Aether Downloader backend.

📂 Project Directory Structure

backend/
├── package.json
├── tsconfig.json
├── render.yaml
├── Dockerfile
├── .env.example
├── README.md
└── src/
    ├── app.ts
    ├── server.ts
    ├── config/
    │   └── env.ts
    ├── types/
    │   └── index.ts
    ├── schemas/
    │   ├── download.schema.ts
    │   └── analytics.schema.ts
    ├── utils/
    │   ├── logger.ts
    │   ├── cache.ts
    │   ├── ytdlp.ts
    │   └── sessionStore.ts
    ├── middleware/
    │   ├── rateLimiter.ts
    │   ├── security.ts
    │   ├── requestLogger.ts
    │   └── errorHandler.ts
    ├── services/
    │   ├── extractor.service.ts
    │   ├── download.service.ts
    │   ├── analytics.service.ts
    │   └── adConfig.service.ts
    ├── controllers/
    │   ├── download.controller.ts
    │   ├── ads.controller.ts
    │   └── analytics.controller.ts
    └── routes/
        ├── download.route.ts
        ├── ads.route.ts
        ├── analytics.route.ts
        └── health.route.ts


⚙️ Core Configuration Files

📄 package.json

{
  "name": "aether-backend",
  "version": "1.0.0",
  "description": "Premium High-Performance Social Media Video Downloader Backend Layer",
  "main": "dist/server.js",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "hono": "^4.4.6",
    "p-limit": "^5.0.0",
    "pino": "^9.2.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.9",
    "pino-pretty": "^11.2.1",
    "tsx": "^4.15.7",
    "typescript": "^5.5.2"
  }
}


📄 tsconfig.json

{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}


📄 render.yaml

services:
  - type: web
    name: aetherbackend
    env: docker
    plan: free
    region: oregon
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: CORS_ORIGIN
        value: "[https://aether-nine-weld.vercel.app](https://aether-nine-weld.vercel.app)"
      - key: CACHE_TTL_MINUTES
        value: 30
      - key: RATE_LIMIT_REQUESTS
        value: 20
      - key: RATE_LIMIT_WINDOW_MINUTES
        value: 1
      - key: MAX_CONCURRENT_JOBS
        value: 3
      - key: YTDLP_TIMEOUT_MS
        value: 30000
      - key: DOWNLOAD_UNLOCK_SECONDS
        value: 5


📄 Dockerfile

FROM node:24-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L [https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp) -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src
RUN npm run build

EXPOSE 10000

ENV PORT=10000
ENV NODE_ENV=production

CMD ["npm", "run", "start"]


📄 .env.example

PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
CACHE_TTL_MINUTES=30
RATE_LIMIT_REQUESTS=20
RATE_LIMIT_WINDOW_MINUTES=1
MAX_CONCURRENT_JOBS=3
YTDLP_TIMEOUT_MS=30000
DOWNLOAD_UNLOCK_SECONDS=5


🛠️ Source Code

📄 src/config/env.ts

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  CACHE_TTL_MINUTES: z.string().transform(Number).default('30'),
  RATE_LIMIT_REQUESTS: z.string().transform(Number).default('20'),
  RATE_LIMIT_WINDOW_MINUTES: z.string().transform(Number).default('1'),
  MAX_CONCURRENT_JOBS: z.string().transform(Number).default('3'),
  YTDLP_TIMEOUT_MS: z.string().transform(Number).default('30000'),
  DOWNLOAD_UNLOCK_SECONDS: z.string().transform(Number).default('5'),
});

export const env = envSchema.parse(process.env);


📄 src/types/index.ts

export interface FormatItem {
  formatId: string;
  ext: string;
  resolution: string;
  url: string;
  filesize?: number;
  quality?: string;
}

export interface VideoMetadata {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'unknown';
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
  videoUrl: string;
  formats: FormatItem[];
}

export interface CacheItem {
  metadata: VideoMetadata;
  expiresAt: number;
}

export interface SessionItem {
  sessionId: string;
  metadata: VideoMetadata;
  createdAt: number;
  unlockAfter: number;
  isUnlocked: boolean;
}

export interface RateLimitInfo {
  count: number;
  resetTime: number;
}


📄 src/schemas/download.schema.ts

import { z } from 'zod';

export const analyzeUrlSchema = z.object({
  url: z.string().url({ message: 'A valid absolute URL configuration is required.' })
});

export const unlockSessionSchema = z.object({
  sessionId: z.string().uuid({ message: 'A valid structural UUID tracking session token is required.' })
});


📄 src/schemas/analytics.schema.ts

import { z } from 'zod';

export const trackEventSchema = z.object({
  event: z.enum([
    'url_analyzed',
    'download_clicked',
    'download_unlocked',
    'ad_view',
    'ad_closed',
    'history_reused'
  ])
});


📄 src/utils/logger.ts

import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino.default({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});


📄 src/utils/cache.ts

import { CacheItem, VideoMetadata } from '../types/index.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

class MemoryCacheManager {
  private cache = new Map<string, CacheItem>();
  private ttlMs = env.CACHE_TTL_MINUTES * 60 * 1000;

  get(platform: string, url: string): VideoMetadata | null {
    const key = `${platform}:${url}`;
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      logger.info({ key }, 'In-memory metadata cache signature expired');
      this.cache.delete(key);
      return null;
    }
    return cached.metadata;
  }

  set(platform: string, url: string, metadata: VideoMetadata): void {
    const key = `${platform}:${url}`;
    this.cache.set(key, {
      metadata,
      expiresAt: Date.now() + this.ttlMs
    });
  }
}

export const cacheManager = new MemoryCacheManager();


📄 src/utils/sessionStore.ts

import { crypto } from 'hono/utils/crypto';
import { SessionItem, VideoMetadata } from '../types/index.js';
import { env } from '../config/env.js';

class DownloadSessionManager {
  private sessions = new Map<string, SessionItem>();
  private sessionTtlMs = 15 * 60 * 1000;

  createSession(metadata: VideoMetadata): SessionItem {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const item: SessionItem = {
      sessionId,
      metadata,
      createdAt: now,
      unlockAfter: now + (env.DOWNLOAD_UNLOCK_SECONDS * 1000),
      isUnlocked: false
    };
    this.sessions.set(sessionId, item);
    return item;
  }

  getSession(sessionId: string): SessionItem | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.createdAt + this.sessionTtlMs) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  unlock(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session || Date.now() < session.unlockAfter) return false;
    session.isUnlocked = true;
    return true;
  }
}

export const sessionStore = new DownloadSessionManager();


📄 src/utils/ytdlp.ts

import { execFile } from 'child_process';
import { env } from '../config/env.js';

export const execYtDlp = (url: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      url
    ];

    const child = execFile('yt-dlp', args, { timeout: env.YTDLP_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr || error.message));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (parseError) {
        reject(new Error('Failed to serialize target payload extraction structural mapping downstream.'));
      }
    });
  });
};


📄 src/middleware/rateLimiter.ts

import { MiddlewareHandler } from 'hono';
import { RateLimitInfo } from '../types/index.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const rateLimitMap = new Map<string, RateLimitInfo>();
const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

export const rateLimiter = (): MiddlewareHandler => async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return await next();
  }

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return await next();
  }

  record.count++;
  if (record.count > env.RATE_LIMIT_REQUESTS) {
    logger.warn({ ip, count: record.count }, 'In-memory rate limiting boundary breached');
    return c.json({ success: false, message: 'Too many requests. Rate limit exceeded.' }, 429);
  }

  await next();
};


📄 src/middleware/security.ts

import { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';

export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (env.CORS_ORIGIN === '*') {
    c.header('Access-Control-Allow-Origin', '*');
  } else {
    c.header('Access-Control-Allow-Origin', env.CORS_ORIGIN);
  }
  
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }

  await next();
};


📄 src/middleware/requestLogger.ts

import { MiddlewareHandler } from 'hono';
import { logger } from '../utils/logger.js';

export const requestLogger = (): MiddlewareHandler => async (c, next) => {
  const { method, url } = c.req;
  const startTime = Date.now();
  logger.info({ method, url }, 'Incoming network verification process execution triggered');
  await next();
  const duration = Date.now() - startTime;
  logger.info({ method, url, status: c.res.status, duration: `${duration}ms` }, 'Egress application cycle finalized');
};


📄 src/middleware/errorHandler.ts

import { ErrorHandler } from 'hono';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  logger.error({ error: err.message, stack: err.stack }, 'Uncaught architectural pipeline runtime anomaly caught');
  return c.json({
    success: false,
    message: 'Unable to process or isolate remote video resource compilation execution streams properly.'
  }, 500);
};


📄 src/services/extractor.service.ts

import pLimit from 'p-limit';
import { VideoMetadata, FormatItem } from '../types/index.js';
import { execYtDlp } from '../utils/ytdlp.js';
import { cacheManager } from '../utils/cache.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const limit = pLimit(env.MAX_CONCURRENT_JOBS);

export class ExtractorService {
  public detectPlatform(url: string): VideoMetadata['platform'] {
    const lowercaseUrl = url.toLowerCase();
    if (lowercaseUrl.includes('instagram.com')) return 'instagram';
    if (lowercaseUrl.includes('tiktok.com')) return 'tiktok';
    if (lowercaseUrl.includes('youtube.com') || lowercaseUrl.includes('youtu.be')) return 'youtube';
    if (lowercaseUrl.includes('facebook.com') || lowercaseUrl.includes('fb.watch')) return 'facebook';
    return 'unknown';
  }

  public async extractMetadata(url: string): Promise<VideoMetadata> {
    const platform = this.detectPlatform(url);
    if (platform === 'unknown') {
      throw new Error('Unsupported content delivery infrastructure destination requested.');
    }

    const cachedData = cacheManager.get(platform, url);
    if (cachedData) {
      logger.info({ platform, url }, 'Metatada processing structural extraction cache hit');
      return cachedData;
    }

    logger.info({ platform, url }, 'Metadata processing structural extraction cache miss, executing queue registration');
    
    const rawData = await limit(() => execYtDlp(url));
    
    const formats: FormatItem[] = (rawData.formats || []).map((f: any) => ({
      formatId: f.format_id,
      ext: f.ext,
      resolution: f.resolution || `${f.width || 0}x${f.height || 0}`,
      url: f.url,
      filesize: f.filesize || f.filesize_approx,
      quality: f.format_note
    })).filter((f: FormatItem) => f.url);

    const metadata: VideoMetadata = {
      platform,
      id: rawData.id || '',
      title: rawData.title || 'Aether Resource Processing Object',
      thumbnail: rawData.thumbnail || '',
      duration: rawData.duration || 0,
      author: rawData.uploader || rawData.artist || 'Social Media Resource Content Creator',
      videoUrl: rawData.url || formats[0]?.url || '',
      formats
    };

    cacheManager.set(platform, url, metadata);
    return metadata;
  }
}

export const extractorService = new ExtractorService();


📄 src/services/download.service.ts

import { sessionStore } from '../utils/sessionStore.js';
import { extractorService } from './extractor.service.js';
import { VideoMetadata } from '../types/index.js';

export class DownloadService {
  public async processUrlAnalysis(url: string): Promise<VideoMetadata> {
    return await extractorService.extractMetadata(url);
  }

  public initInterstitialsSession(metadata: VideoMetadata): { sessionId: string; unlockAfter: number } {
    const session = sessionStore.createSession(metadata);
    return {
      sessionId: session.sessionId,
      unlockAfter: 5
    };
  }

  public verifyUnlockState(sessionId: string): { success: boolean; data?: VideoMetadata } {
    const session = sessionStore.getSession(sessionId);
    if (!session) return { success: false };
    
    const unlocked = sessionStore.unlock(sessionId);
    if (!unlocked) return { success: false };

    return {
      success: true,
      data: session.metadata
    };
  }
}

export const downloadService = new DownloadService();


📄 src/services/analytics.service.ts

class RealtimeAnalyticsEngine {
  private store = {
    url_analyzed: 0,
    download_clicked: 0,
    download_unlocked: 0,
    ad_view: 0,
    ad_closed: 0,
    history_reused: 0
  };

  increment(event: keyof typeof this.store): void {
    if (this.store[event] !== undefined) {
      this.store[event]++;
    }
  }

  getMetrics() {
    return { ...this.store, timestamp: Date.now() };
  }
}

export const analyticsEngine = new RealtimeAnalyticsEngine();


📄 src/services/adConfig.service.ts

export class AdConfigService {
  public fetchActivePlacements() {
    return {
      interstitialDelay: 5,
      enableBottomAnchor: true,
      enableSidebar: true,
      enableLeaderboard: true,
      enableNativeAds: true
    };
  }
}

export const adConfigService = new AdConfigService();


📄 src/controllers/download.controller.ts

import { Context } from 'hono';
import { downloadService } from '../services/download.service.js';
import { analyzeUrlSchema, unlockSessionSchema } from '../schemas/download.schema.js';
import { analyticsEngine } from '../services/analytics.service.js';

export class DownloadController {
  public async analyze(c: Context) {
    const body = await c.req.json();
    const result = analyzeUrlSchema.safeParse(body);
    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }
    const data = await downloadService.processUrlAnalysis(result.data.url);
    analyticsEngine.increment('url_analyzed');
    return c.json({ success: true, data });
  }

  public async startSession(c: Context) {
    const body = await c.req.json();
    const result = analyzeUrlSchema.safeParse(body);
    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }
    const meta = await downloadService.processUrlAnalysis(result.data.url);
    const sessionData = downloadService.initInterstitialsSession(meta);
    analyticsEngine.increment('download_clicked');
    return c.json(sessionData);
  }

  public async verifyUnlock(c: Context) {
    const body = await c.req.json();
    const result = unlockSessionSchema.safeParse(body);
    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }
    const unlockProcess = downloadService.verifyUnlockState(result.data.sessionId);
    if (!unlockProcess.success) {
      return c.json({ success: false, message: 'Verification lease pending or session unfulfilled.' }, 403);
    }
    analyticsEngine.increment('download_unlocked');
    return c.json({ success: true, data: unlockProcess.data });
  }
}

export const downloadController = new DownloadController();


📄 src/controllers/ads.controller.ts

import { Context } from 'hono';
import { adConfigService } from '../services/adConfig.service.js';

export class AdsController {
  public getConfig(c: Context) {
    return c.json(adConfigService.fetchActivePlacements());
  }
}

export const adsController = new AdsController();


📄 src/controllers/analytics.controller.ts

import { Context } from 'hono';
import { analyticsEngine } from '../services/analytics.service.js';

export class AnalyticsController {
  public track(c: Context) {
    const body = c.req.valid('json' as any);
    analyticsEngine.increment(body.event);
    return c.json({ success: true });
  }

  public getStats(c: Context) {
    return c.json({ success: true, stats: analyticsEngine.getMetrics() });
  }
}

export const analyticsController = new AnalyticsController();


📄 src/routes/health.route.ts

import { Hono } from 'hono';

const healthRouter = new Hono();
healthRouter.get('/', (c) => c.json({ status: 'healthy', uptime: process.uptime() }));

export default healthRouter;


📄 src/routes/download.route.ts

import { Hono } from 'hono';
import { downloadController } from '../controllers/download.controller.js';

const downloadRouter = new Hono();
downloadRouter.post('/', (c) => downloadController.analyze(c));
downloadRouter.post('/session', (c) => downloadController.startSession(c));
downloadRouter.post('/unlock', (c) => downloadController.verifyUnlock(c));

export default downloadRouter;


📄 src/routes/ads.route.ts

import { Hono } from 'hono';
import { adsController } from '../controllers/ads.controller.js';

const adsRouter = new Hono();
adsRouter.get('/config', (c) => adsController.getConfig(c));

export default adsRouter;


📄 src/routes/analytics.route.ts

import { Hono } from 'hono';
import { analyticsController } from '../controllers/analytics.controller.js';
import { zValidator } from '@hono/zod-validator';
import { trackEventSchema } from '../schemas/analytics.schema.js';

const analyticsRouter = new Hono();
analyticsRouter.post('/', zValidator('json', trackEventSchema), (c) => analyticsController.track(c));
analyticsRouter.get('/stats', (c) => analyticsController.getStats(c));

export default analyticsRouter;


📄 src/app.ts

import { Hono } from 'hono';
import { securityHeaders } from './middleware/security.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.route.js';
import downloadRouter from './routes/download.route.js';
import adsRouter from './routes/ads.route.js';
import analyticsRouter from './routes/analytics.route.js';

const app = new Hono();

app.use('*', securityHeaders());
app.use('*', requestLogger());
app.use('/api/*', rateLimiter());

app.route('/health', healthRouter);
app.route('/api/download', downloadRouter);
app.route('/api/ads', adsRouter);
app.route('/api/analytics', analyticsRouter);

app.onError(errorHandler);

export default app;


📄 src/server.ts

import { serve } from '@hono/node-server';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

logger.info(`Starting Aether Core Engine on runtime port ${env.PORT}`);

serve({
  fetch: app.fetch,
  port: env.PORT
});
