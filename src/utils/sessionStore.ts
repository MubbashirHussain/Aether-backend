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
