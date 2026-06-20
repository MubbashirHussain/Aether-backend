import { Context } from "hono";
import { createReadStream, statSync, existsSync } from "fs";
import { downloadService } from "../services/download.service.js";
import {
  analyzeUrlSchema,
  unlockSessionSchema,
  downloadFormatSchema,
} from "../schemas/download.schema.js";
import { downloadMedia, cleanupFile } from "../services/media.service.js";
import { streamTokenStore } from "../utils/streamTokenStore.js";
import { analyticsEngine } from "../services/analytics.service.js";
import { logger } from "../utils/logger.js";
import axios from "axios";

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
    console.log("the data", data);
    // Strip all direct video/audio URLs from the response
    return c.json({
      success: true,
      data: downloadService.toSafeMetadata(data),
    });
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
   * Streams a video by proxy through a short-lived token.
   * The browser only sees /api/download/stream/:token — never the original CDN URL.
   *
   * GET /api/download/stream/:token
   * Query params:
   *   ?download=1 — sets Content-Disposition: attachment for file download
   */
  public async streamVideo(c: Context) {
    const token = c.req.param("token") ?? "";
    const tokenData = streamTokenStore.getToken(token);

    if (!tokenData) {
      return c.json(
        { success: false, message: "Invalid or expired stream token." },
        404,
      );
    }

    const { videoUrl, mimeType } = tokenData;
    const isDownload = c.req.query("download") === "1";

    try {
      // Forward the Range header from the client to the CDN for seeking support
      const rangeHeader = c.req.header("range");
      const upstreamHeaders: Record<string, string> = {};
      if (rangeHeader) {
        upstreamHeaders["Range"] = rangeHeader;
      }

      const upstreamRes = await axios.get(videoUrl, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(30_000),
        responseType: "stream",
      });

      if (!upstreamRes.status && upstreamRes.status !== 206) {
        logger.error(
          { status: upstreamRes.status, token },
          "Upstream video fetch failed",
        );
        return c.json(
          {
            success: false,
            message:
              "Failed to fetch video source. The media may have expired. Please re-analyze the URL.",
          },
          502,
        );
      }

      // Build response headers — no Content-Length so the runtime
      // uses Transfer-Encoding: chunked and flushes each chunk immediately.
      const responseHeaders: Record<string, string> = {
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
        "Transfer-Encoding": "chunked",
      };

      if (upstreamRes.status === 206) {
        const contentRange = upstreamRes.headers["content-range"];
        if (contentRange) {
          responseHeaders["Content-Range"] = contentRange;
        }
      }

      if (isDownload) {
        const fileName = `aether_video.${mimeType.split("/").pop() || "mp4"}`;
        responseHeaders["Content-Disposition"] =
          `attachment; filename="${fileName}"`;
      }

      analyticsEngine.increment("video_streamed");

      // Manually read chunks from upstream and enqueue them to the client
      // const upstreamBody = upstreamRes.data;
      if (!upstreamRes.data) {
        return c.newResponse(null, 204);
      }
      const nodeStream = upstreamRes.data;
      const stream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });

          nodeStream.on("end", () => {
            controller.close();
          });

          nodeStream.on("error", (err: Error) => {
            controller.error(err);
          });
        },

        cancel() {
          nodeStream.destroy();
        },
      });

      return c.newResponse(
        stream,
        upstreamRes.status as 200 | 206,
        responseHeaders,
      );
    } catch (error) {
      const message = (error as Error).message;
      logger.error({ error: message, token }, "Stream proxy failed");

      if (message.includes("abort") || message.includes("timeout")) {
        return c.json(
          {
            success: false,
            message: "Video source timed out. Please try again.",
          },
          504,
        );
      }

      return c.json(
        { success: false, message: "Failed to stream video." },
        502,
      );
    }
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
          message:
            "Failed to download media. The video source may have expired.",
        },
        500,
      );
    }
  }
}

export const downloadController = new DownloadController();
