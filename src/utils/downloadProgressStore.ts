import { logger } from "./logger.js";

export interface DownloadProgressState {
  downloadId: string;
  status: "queued" | "downloading" | "completed" | "error";
  percent: number;
  speed: string;
  eta: string;
  totalSize: number;
  downloadedBytes: number;
  /** Set when download completes */
  filePath?: string;
  mimeType?: string;
  error?: string;
  createdAt: number;
}

type ProgressListener = (state: DownloadProgressState) => void;

class DownloadProgressStore {
  private downloads = new Map<string, DownloadProgressState>();
  private listeners = new Map<string, Set<ProgressListener>>();
  private readonly ttlMs = 30 * 60 * 1000; // 30 minutes

  createDownload(downloadId: string): void {
    this.downloads.set(downloadId, {
      downloadId,
      status: "queued",
      percent: 0,
      speed: "0 B/s",
      eta: "--:--",
      totalSize: 0,
      downloadedBytes: 0,
      createdAt: Date.now(),
    });
  }

  updateProgress(
    downloadId: string,
    updates: Partial<DownloadProgressState>,
  ): void {
    const state = this.downloads.get(downloadId);
    if (!state) return;

    Object.assign(state, updates);
    this.notify(downloadId, state);
  }

  getDownload(downloadId: string): DownloadProgressState | undefined {
    return this.downloads.get(downloadId);
  }

  subscribe(downloadId: string, listener: ProgressListener): () => void {
    if (!this.listeners.has(downloadId)) {
      this.listeners.set(downloadId, new Set());
    }
    this.listeners.get(downloadId)!.add(listener);

    // Send current state immediately if exists
    const state = this.downloads.get(downloadId);
    if (state) {
      listener(state);
    }

    return () => {
      this.listeners.get(downloadId)?.delete(listener);
    };
  }

  private notify(downloadId: string, state: DownloadProgressState): void {
    this.listeners.get(downloadId)?.forEach((listener) => {
      try {
        listener(state);
      } catch {
        // ignore listener errors
      }
    });
  }

  removeDownload(downloadId: string): void {
    this.downloads.delete(downloadId);
    this.listeners.delete(downloadId);
  }

  /** Clean up expired downloads */
  cleanup(): void {
    const now = Date.now();
    for (const [id, state] of this.downloads.entries()) {
      if (now - state.createdAt > this.ttlMs) {
        this.downloads.delete(id);
        this.listeners.delete(id);
        logger.debug({ downloadId: id }, "Cleaned up expired download state");
      }
    }
  }
}

export const downloadProgressStore = new DownloadProgressStore();

// Run cleanup every 5 minutes
setInterval(() => downloadProgressStore.cleanup(), 5 * 60 * 1000);
