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
