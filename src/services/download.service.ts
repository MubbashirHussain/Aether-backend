import { VideoMetadata, SafeVideoMetadata } from "../types/index.js";
import { sessionStore } from "../utils/sessionStore.js";
import { streamTokenStore } from "../utils/streamTokenStore.js";
import { extractorService } from "./extractor.service.js";

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

  public async processUrlAnalysis(url: string): Promise<VideoMetadata> {
    console.log("enter download service");
    return await extractorService.extractMetadata(url);
  }

  public initInterstitialsSession(metadata: VideoMetadata): {
    sessionId: string;
    unlockAfter: number;
  } {
    const session = sessionStore.createSession(metadata);
    return {
      sessionId: session.sessionId,
      unlockAfter: 5,
    };
  }

  public verifyUnlockState(sessionId: string): {
    success: boolean;
    data?: {
      metadata: SafeVideoMetadata;
      streamToken: string;
    };
  } {
    const session = sessionStore.getSession(sessionId);
    if (!session) return { success: false };

    const unlocked = sessionStore.unlock(sessionId);
    if (!unlocked) return { success: false };

    // Create a stream token for the main video URL
    const videoUrl = session.metadata.videoUrl;
    const mimeType = this.getMimeType(videoUrl);
    const streamToken = streamTokenStore.createToken(
      videoUrl,
      mimeType,
      sessionId,
    );

    return {
      success: true,
      data: {
        metadata: this.toSafeMetadata(session.metadata),
        streamToken,
      },
    };
  }
}

export const downloadService = new DownloadService();
