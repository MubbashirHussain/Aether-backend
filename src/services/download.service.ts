import {
  VideoMetadata,
  SafeVideoMetadata,
  SafeFormatItem,
} from "../types/index.js";
import { sessionStore } from "../utils/sessionStore.js";
import { streamTokenStore } from "../utils/streamTokenStore.js";
import { extractorService } from "./extractor.service.js";

export interface UnlockResult {
  success: boolean;
  message: string;
  data?: {
    unlockAfter?: number;
    unlocked?: boolean;
    selectedFormat?: SafeFormatItem;
    streamToken?: string;
  };
  streamToken?: string;
}

export class DownloadService {
  /**
   * Converts full VideoMetadata (internal, with URLs) to a safe client-facing version.
   */
  public toSafeMetadata(meta: VideoMetadata): SafeVideoMetadata {
    return {
      platform: meta.platform,
      id: meta.id,
      title: meta.title,
      thumbnail: meta.thumbnail,
      duration: meta.duration,
      author: meta.author,
      formats: meta.formats.map((f) => ({
        formatId: f.formatId,
        ext: f.ext,
        resolution: f.resolution,
        quality: f.quality,
        filesize: f.filesize,
        isAudioAvailable: f.isAudioAvailable,
      })),
    };
  }

  /**
   * Determines the best mime type for a video URL.
   */
  private getMimeType(url: string): string {
    const ext = url.split(".").pop()?.toLowerCase().split("?")[0] || "";
    const mimeTypes: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      mkv: "video/x-matroska",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
    };
    return mimeTypes[ext] || "video/mp4";
  }

  public async processUrlAnalysis(
    url: string,
    raw: boolean = false,
  ): Promise<VideoMetadata> {
    return await extractorService.extractMetadata(url, raw);
  }

  public initInterstitialsSession(
    metadata: VideoMetadata,
    formatId: string,
  ): { sessionId: string; unlockAfter: number } {
    const selectedFormat = metadata.formats.find(
      (f) => f.formatId === formatId,
    );
    if (!selectedFormat) {
      throw new Error(`Format ${formatId} not found in video metadata`);
    }
    const session = sessionStore.createSession(metadata, selectedFormat);
    return {
      sessionId: session.sessionId,
      unlockAfter: 5,
    };
  }

  public verifyUnlockState(sessionId: string): UnlockResult {
    const session = sessionStore.getSession(sessionId);
    if (!session) return { success: false, message: "Session not found" };

    const unlocked = sessionStore.unlock(sessionId);
    if (!unlocked.unlocked)
      return {
        success: false,
        message: "Session not unlocked",
        data: {
          unlockAfter: unlocked.unlockAfter,
          unlocked: unlocked.unlocked,
        },
      };

    // Create a stream token for the selected format's URL
    const videoUrl = session.selectedFormat.url;
    const mimeType = this.getMimeType(videoUrl);
    const streamToken = streamTokenStore.createToken(
      videoUrl,
      mimeType,
      sessionId,
    );

    const sf = session.selectedFormat;
    return {
      success: true,
      message: "Session unlocked successfully",
      data: {
        selectedFormat: {
          formatId: sf.formatId,
          ext: sf.ext,
          resolution: sf.resolution,
          quality: sf.quality,
          filesize: sf.filesize,
          isAudioAvailable: sf.isAudioAvailable,
        },
        streamToken,
      },
    };
  }
}

export const downloadService = new DownloadService();
