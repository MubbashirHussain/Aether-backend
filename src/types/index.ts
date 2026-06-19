export interface FormatItem {
  formatId: string;
  ext: string;
  resolution: string;
  url: string;
  filesize?: number;
  quality?: string;
  /** Whether the download URL was tested with a HEAD request */
  urlTested: boolean;
  /** Whether the URL responded successfully (only meaningful when urlTested is true) */
  urlWorking: boolean;
  /** Whether this format contains an audio stream */
  isAudioAvailable: boolean;
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
