import { Context } from "hono";
import { createReadStream, statSync, existsSync } from "fs";
import { downloadService } from "../services/download.service.js";
import {
  analyzeUrlSchema,
  unlockSessionSchema,
  downloadFormatSchema,
} from "../schemas/download.schema.js";
import { downloadMedia, cleanupFile } from "../services/media.service.js";
import { analyticsEngine } from "../services/analytics.service.js";
import { logger } from "../utils/logger.js";

export class DownloadController {
  public async analyze(c: Context) {
    const body = await c.req.json();
    const result = analyzeUrlSchema.safeParse(body);
    logger.info("enter download controller analyze");
    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }
    const data = await downloadService.processUrlAnalysis(result.data.url);
    logger.info("got the download controller analyze response");
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

  /**
   * Downloads a specific format of a video and streams it to the client.
   * If the format has no audio and ffmpeg is available, it automatically merges
   * the best audio stream into the output.
   *
   * POST /api/download/format
   * Body: { url: string, formatId: string, isAudioAvailable?: boolean }
   */
  public async downloadFormat(c: Context) {
    const body = await c.req.json();
    const result = downloadFormatSchema.safeParse(body);

    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }

    const { url, formatId, isAudioAvailable } = result.data;

    try {
      logger.info({ formatId, isAudioAvailable }, "Starting media download");

      const downloadResult = await downloadMedia(
        url,
        formatId,
        isAudioAvailable ?? false,
      );

      if (!existsSync(downloadResult.filePath)) {
        return c.json(
          { success: false, message: "Downloaded file not found on server" },
          500,
        );
      }

      const stats = statSync(downloadResult.filePath);
      const fileName = `aether_${formatId}.${downloadResult.filePath.split(".").pop()}`;

      // Stream the file to the client
      const stream = createReadStream(downloadResult.filePath);

      // Clean up the file after streaming completes
      stream.on("end", () => cleanupFile(downloadResult.filePath));
      stream.on("error", () => cleanupFile(downloadResult.filePath));

      analyticsEngine.increment("format_downloaded");

      return c.newResponse(stream as any, 200, {
        "Content-Type": downloadResult.mimeType,
        "Content-Length": String(stats.size),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-Audio-Merged": String(downloadResult.audioMerged),
      });
    } catch (error) {
      const message = (error as Error).message;
      logger.error({ error: message, formatId }, "Media download failed");

      // Check for common yt-dlp errors
      if (message.includes("Requested format is not available")) {
        return c.json(
          {
            success: false,
            message:
              "The requested format is no longer available. Try a different format or re-analyze the URL.",
          },
          404,
        );
      }

      return c.json(
        {
          success: false,
          message: "Failed to download media. The video source may have expired.",
        },
        500,
      );
    }
  }
}

export const downloadController = new DownloadController();
