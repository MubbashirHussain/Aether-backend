import { Context } from "hono";
import { stream } from "hono/streaming";
import { createReadStream, statSync, existsSync } from "fs";
import { downloadService } from "../services/download.service.js";
import {
  analyzeUrlSchema,
  unlockSessionSchema,
  downloadFormatSchema,
} from "../schemas/download.schema.js";
import {
  downloadMedia,
  downloadMediaWithProgress,
  cleanupFile,
} from "../services/media.service.js";
import { streamTokenStore } from "../utils/streamTokenStore.js";
import { downloadProgressStore } from "../utils/downloadProgressStore.js";
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

  /**
   * Initiates a format download with real-time progress tracking.
   *
   * POST /api/download/format/init
   * Body: { url: string, formatId: string, isAudioAvailable?: boolean }
   *
   * Returns a downloadId immediately. The client then:
   * 1. Connects to GET /api/download/format/progress/:downloadId (SSE) for progress
   * 2. Downloads the file from GET /api/download/format/file/:downloadId when complete
   */
  public async initDownload(c: Context) {
    const body = await c.req.json();
    const result = downloadFormatSchema.safeParse(body);

    if (!result.success) {
      return c.json({ success: false, errors: result.error.errors }, 400);
    }

    const { url, formatId, isAudioAvailable } = result.data;
    const downloadId = crypto.randomUUID();

    downloadProgressStore.createDownload(downloadId);

    // Start the download asynchronously (don't await)
    downloadMediaWithProgress(
      url,
      formatId,
      isAudioAvailable ?? false,
      (progress) => {
        downloadProgressStore.updateProgress(downloadId, {
          status: "downloading",
          percent: progress.percent,
          speed: progress.speed,
          eta: progress.eta,
          totalSize: progress.totalSize,
          downloadedBytes: Math.round(
            (progress.percent / 100) * progress.totalSize,
          ),
        });
      },
    )
      .then((result) => {
        const stats = statSync(result.filePath);
        downloadProgressStore.updateProgress(downloadId, {
          status: "completed",
          percent: 100,
          filePath: result.filePath,
          mimeType: result.mimeType,
          totalSize: stats.size,
          downloadedBytes: stats.size,
        });
        logger.info({ downloadId, filePath: result.filePath }, "Download completed");
      })
      .catch((err) => {
        downloadProgressStore.updateProgress(downloadId, {
          status: "error",
          error: (err as Error).message,
        });
        logger.error({ downloadId, error: (err as Error).message }, "Download failed");
      });

    analyticsEngine.increment("format_download_initiated");

    return c.json({ success: true, data: { downloadId } });
  }

  /**
   * SSE endpoint that streams real-time download progress to the client.
   *
   * GET /api/download/format/progress/:downloadId
   *
   * Events:
   *   data: { status, percent, speed, eta, totalSize }
   *   data: { status: "completed", mimeType, ... }
   *   data: { status: "error", error, ... }
   */
  public async streamProgress(c: Context) {
    const downloadId = c.req.param("downloadId") ?? "";

    const initialState = downloadProgressStore.getDownload(downloadId);
    if (!initialState) {
      return c.json(
        { success: false, message: "Download not found or expired." },
        404,
      );
    }

    // Set SSE headers and use Hono's streaming API
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    // If already completed or errored, send state and close
    if (initialState.status === "completed" || initialState.status === "error") {
      const data = JSON.stringify({
        status: initialState.status,
        percent: initialState.percent,
        speed: initialState.speed,
        eta: initialState.eta,
        totalSize: initialState.totalSize,
        downloadedBytes: initialState.downloadedBytes,
        error: initialState.error,
      });
      return c.body(`data: ${data}\n\n`);
    }

    let isDone = false;

    return stream(c, async (stream) => {
      const encoder = new TextEncoder();

      // Send current state immediately
      const initialEvent = JSON.stringify({
        status: initialState.status,
        percent: initialState.percent,
        speed: initialState.speed,
        eta: initialState.eta,
        totalSize: initialState.totalSize,
        downloadedBytes: initialState.downloadedBytes,
      });
      await stream.write(encoder.encode(`data: ${initialEvent}\n\n`));

      // Subscribe to updates
      const unsubscribe = downloadProgressStore.subscribe(downloadId, (state) => {
        if (isDone) return;

        const data = JSON.stringify({
          status: state.status,
          percent: state.percent,
          speed: state.speed,
          eta: state.eta,
          totalSize: state.totalSize,
          downloadedBytes: state.downloadedBytes,
          error: state.error,
        });

        stream
          .write(encoder.encode(`data: ${data}\n\n`))
          .then(() => {
            if (state.status === "completed" || state.status === "error") {
              isDone = true;
              unsubscribe();
              // Hono will close the stream when we return
            }
          })
          .catch(() => {
            // Client disconnected
            unsubscribe();
          });
      });

      // Wait until done or client disconnects
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (isDone) {
            clearInterval(check);
            resolve();
          }
        }, 500);

        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(check);
          isDone = true;
          unsubscribe();
          resolve();
        });
      });
    });
  }

  /**
   * Downloads the completed file with Range support for resume.
   *
   * GET /api/download/format/file/:downloadId
   *
   * Supports:
   * - Range headers for partial content (resume)
   * - 206 Partial Content responses
   * - Content-Disposition: attachment
   */
  public async downloadFile(c: Context) {
    const downloadId = c.req.param("downloadId") ?? "";
    const state = downloadProgressStore.getDownload(downloadId);

    if (!state || state.status !== "completed" || !state.filePath) {
      return c.json(
        {
          success: false,
          message:
            state?.status === "error"
              ? "Download failed. Please try again."
              : "Download not ready yet or expired.",
        },
        state?.status === "error" ? 500 : 404,
      );
    }

    if (!existsSync(state.filePath)) {
      downloadProgressStore.updateProgress(downloadId, { status: "error", error: "File not found on server" });
      return c.json(
        { success: false, message: "Download file no longer available." },
        404,
      );
    }

    const filePath = state.filePath;
    const stats = statSync(filePath);
    const fileExt = filePath.split(".").pop()?.toLowerCase() || "mp4";
    const fileName = `aether_video_${downloadId.slice(0, 8)}.${fileExt}`;
    const fileSize = stats.size;
    const mimeType = state.mimeType || "application/octet-stream";

    const rangeHeader = c.req.header("range");

    if (rangeHeader) {
      // Parse Range header for resume support
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        return c.newResponse(null, 416, {
          "Content-Range": `bytes */${fileSize}`,
        });
      }

      const chunkSize = end - start + 1;
      const stream = createReadStream(filePath, { start, end });

      // Clean up after streaming
      stream.on("end", () => cleanupFile(filePath));
      stream.on("error", () => cleanupFile(filePath));

      analyticsEngine.increment("format_download_resumed");

      return c.newResponse(stream as any, 206, {
        "Content-Type": mimeType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-Download-Resumed": "true",
      });
    }

    // Full file download
    const stream = createReadStream(filePath);

    stream.on("end", () => cleanupFile(filePath));
    stream.on("error", () => cleanupFile(filePath));

    analyticsEngine.increment("format_downloaded");

    return c.newResponse(stream as any, 200, {
      "Content-Type": mimeType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    });
  }

  /**
   * Checks the status of an existing download.
   * Used on page load to check if there's a downloadable file available.
   *
   * GET /api/download/format/status/:downloadId
   */
  public async downloadStatus(c: Context) {
    const downloadId = c.req.param("downloadId") ?? "";
    const state = downloadProgressStore.getDownload(downloadId);

    if (!state) {
      return c.json(
        { success: false, message: "Download not found or expired." },
        404,
      );
    }

    return c.json({
      success: true,
      data: {
        status: state.status,
        percent: state.percent,
        speed: state.speed,
        eta: state.eta,
        totalSize: state.totalSize,
        downloadedBytes: state.downloadedBytes,
        error: state.error,
      },
    });
  }
}

export const downloadController = new DownloadController();
