import { Context } from "hono";
import { downloadService } from "../services/download.service.js";
import {
  analyzeUrlSchema,
  unlockSessionSchema,
} from "../schemas/download.schema.js";
import { analyticsEngine } from "../services/analytics.service.js";

export class DownloadController {
  public async analyze(c: Context) {
    const body = await c.req.json();
    const result = analyzeUrlSchema.safeParse(body);
    console.log("enter download controller analyze");
    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }
    const data = await downloadService.processUrlAnalysis(result.data.url);
    console.log("download controller analyze data", data);
    analyticsEngine.increment("url_analyzed");
    return c.json({ success: true, data });
  }

  public async startSession(c: Context) {
    const body = await c.req.json();
    const result = analyzeUrlSchema.safeParse(body);
    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }
    const meta = await downloadService.processUrlAnalysis(result.data.url);
    const sessionData = downloadService.initInterstitialsSession(meta);
    analyticsEngine.increment("download_clicked");
    return c.json(sessionData);
  }

  public async verifyUnlock(c: Context) {
    const body = await c.req.json();
    const result = unlockSessionSchema.safeParse(body);
    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }
    const unlockProcess = downloadService.verifyUnlockState(
      result.data.sessionId,
    );
    if (!unlockProcess.success) {
      return c.json(
        {
          success: false,
          message: "Verification lease pending or session unfulfilled.",
        },
        403,
      );
    }
    analyticsEngine.increment("download_unlocked");
    return c.json({ success: true, data: unlockProcess.data });
  }
}

export const downloadController = new DownloadController();
