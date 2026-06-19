import { Context } from 'hono';
import { analyticsEngine } from '../services/analytics.service.js';

export class AnalyticsController {
  public async track(c: Context) {
    const body = await c.req.json();
    analyticsEngine.increment(body.event);
    return c.json({ success: true });
  }

  public getStats(c: Context) {
    return c.json({ success: true, stats: analyticsEngine.getMetrics() });
  }
}

export const analyticsController = new AnalyticsController();
