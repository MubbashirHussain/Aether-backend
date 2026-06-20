class RealtimeAnalyticsEngine {
  private store = {
    url_analyzed: 0,
    download_clicked: 0,
    download_unlocked: 0,
    format_downloaded: 0,
    video_streamed: 0,
    ad_view: 0,
    ad_closed: 0,
    history_reused: 0,
  };

  increment(event: keyof typeof this.store): void {
    if (this.store[event] !== undefined) {
      this.store[event]++;
    }
  }

  getMetrics() {
    return { ...this.store, timestamp: Date.now() };
  }
}

export const analyticsEngine = new RealtimeAnalyticsEngine();
