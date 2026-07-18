import { SessionItem, VideoMetadata, FormatItem } from "../types/index.js";
import { env } from "../config/env.js";

class DownloadSessionManager {
  private sessions = new Map<string, SessionItem>();
  private sessionTtlMs = 15 * 60 * 1000;

  createSession(
    metadata: VideoMetadata,
    selectedFormat: FormatItem,
  ): SessionItem {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const item: SessionItem = {
      sessionId,
      metadata,
      selectedFormat,
      createdAt: now,
      unlockAfter: now + env.DOWNLOAD_UNLOCK_SECONDS * 1000,
      isUnlocked: false,
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

  unlock(sessionId: string): { unlockAfter: number; unlocked: boolean } {
    const session = this.getSession(sessionId);
    if (!session || Date.now() < session.unlockAfter)
      return {
        unlockAfter: ((session?.unlockAfter ?? 0) - Date.now()) / 1000,
        unlocked: false,
      };
    session.isUnlocked = true;
    return {
      unlocked: true,
      unlockAfter: 0,
    };
  }
}

export const sessionStore = new DownloadSessionManager();
