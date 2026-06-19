import { execFile } from "child_process";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const TEMP_DIR = env.TEMP_DIR || join(tmpdir(), "aether-downloads");

/**
 * Ensures the temp directory exists for storing downloaded media files.
 */
function ensureTempDir(): void {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Checks if ffmpeg is available on the system.
 * yt-dlp needs ffmpeg to merge separate video+audio streams into one file.
 */
async function isFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile("ffmpeg", ["-version"], { timeout: 3_000 }, (error) => {
      resolve(!error);
    });
    child.on("error", () => resolve(false));
  });
}

export interface DownloadResult {
  /** Path to the downloaded file on disk */
  filePath: string;
  /** MIME type of the output file */
  mimeType: string;
  /** Whether audio was merged into the output */
  audioMerged: boolean;
}

/**
 * Downloads a video from a URL using yt-dlp.
 *
 * If the selected format has no audio (`isAudioAvailable = false`), this will
 * automatically merge the best available audio stream using yt-dlp + ffmpeg.
 *
 * @param videoUrl - The original video URL (from user input)
 * @param formatId - The yt-dlp format ID to download
 * @param isAudioAvailable - Whether the selected format already has audio
 * @returns The path to the downloaded file and metadata
 */
export async function downloadMedia(
  videoUrl: string,
  formatId: string,
  isAudioAvailable: boolean,
): Promise<DownloadResult> {
  ensureTempDir();

  const hasFfmpeg = await isFfmpegAvailable();
  const safeId = videoUrl.split("/").pop()?.replace(/[^a-zA-Z0-9_-]/g, "") || `video-${Date.now()}`;
  const outputTemplate = join(TEMP_DIR, `${safeId}_${formatId}.%(ext)s`);

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--print", "after_move:filepath",  // Print the output filename so we know where it ended up
    "-o", outputTemplate,
  ];

  if (!isAudioAvailable && hasFfmpeg) {
    // Format has no audio — merge with best available audio
    args.push("--format", `${formatId}+bestaudio/best`);
    args.push("--merge-output-format", "mp4");
    logger.info({ formatId }, "Format has no audio — merging with best audio stream");
  } else if (!isAudioAvailable && !hasFfmpeg) {
    // No audio and no ffmpeg — download as-is (frontend will handle it)
    logger.warn(
      { formatId },
      "Format has no audio and ffmpeg is not available — downloading video-only stream",
    );
    args.push("--format", formatId);
  } else {
    // Format already has audio — download directly
    args.push("--format", formatId);
  }

  args.push(videoUrl);

  logger.info({ args, hasFfmpeg, isAudioAvailable }, "Downloading media with yt-dlp");

  return new Promise((resolve, reject) => {
    const child = execFile(
      getYtDlpBinary(),
      args,
      { timeout: env.YTDLP_DOWNLOAD_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          // Clean up partial files on error
          return reject(new Error(stderr || error.message));
        }

        const outputPath = stdout.trim().split("\n").pop() || "";
        if (!outputPath || !existsSync(outputPath)) {
          return reject(new Error("Download completed but output file not found"));
        }

        const ext = outputPath.split(".").pop()?.toLowerCase() || "mp4";
        const mimeTypes: Record<string, string> = {
          mp4: "video/mp4",
          webm: "video/webm",
          mkv: "video/x-matroska",
          avi: "video/x-msvideo",
          mov: "video/quicktime",
          m4a: "audio/mp4",
          mp3: "audio/mpeg",
        };

        resolve({
          filePath: outputPath,
          mimeType: mimeTypes[ext] || "application/octet-stream",
          audioMerged: !isAudioAvailable && hasFfmpeg,
        });
      },
    );

    child.on("error", (err) => {
      reject(new Error(`Failed to start yt-dlp process: ${err.message}`));
    });
  });
}

/**
 * Cleans up a downloaded file from disk.
 * Should be called after streaming is complete to free up space.
 */
export function cleanupFile(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.debug({ filePath }, "Cleaned up downloaded media file");
    }
  } catch (error) {
    logger.warn(
      { filePath, error: (error as Error).message },
      "Failed to clean up media file",
    );
  }
}

function getYtDlpBinary(): string {
  return process.env.YTDLP_PATH || (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}
