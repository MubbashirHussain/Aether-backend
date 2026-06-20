import { StreamTokenData } from "../types/index.js";

class StreamTokenManager {
  private tokens = new Map<string, StreamTokenData>();
  private readonly tokenTtlMs = 60 * 60 * 1000; // 5 minutes

  /**
   * Creates a stream token for the given video URL.
   * The token is short-lived (5 min) since CDN URLs can expire.
   */
  createToken(videoUrl: string, mimeType: string, sessionId: string): string {
    const token = crypto.randomUUID();
    const now = Date.now();
    this.tokens.set(token, {
      videoUrl,
      mimeType,
      sessionId,
      expiresAt: now + this.tokenTtlMs,
    });
    return token;
  }

  /**
   * Validates and retrieves a stream token without consuming it.
   * Returns null if the token is invalid or expired.
   * Tokens can be used multiple times within their TTL to support
   * video seeking via Range requests (each range request is a separate HTTP request).
   */
  getToken(token: string): StreamTokenData | null {
    const data = this.tokens.get(token);
    if (!data) return null;
    if (Date.now() > data.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return data;
  }

  /** Removes all expired tokens (call periodically if needed) */
  cleanup(): void {
    const now = Date.now();
    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }
}

export const streamTokenStore = new StreamTokenManager();
