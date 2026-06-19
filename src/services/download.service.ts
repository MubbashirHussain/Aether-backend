import { sessionStore } from "../utils/sessionStore.js";
import { extractorService } from "./extractor.service.js";
import { VideoMetadata } from "../types/index.js";

export class DownloadService {
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
    data?: VideoMetadata;
  } {
    const session = sessionStore.getSession(sessionId);
    if (!session) return { success: false };

    const unlocked = sessionStore.unlock(sessionId);
    if (!unlocked) return { success: false };

    return {
      success: true,
      data: session.metadata,
    };
  }
}

export const downloadService = new DownloadService();
