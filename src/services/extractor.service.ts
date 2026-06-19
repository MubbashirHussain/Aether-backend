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
