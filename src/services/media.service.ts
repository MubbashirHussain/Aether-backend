import { execFile, spawn } from "child_process";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const TEMP_DIR = env.TEMP_DIR || join(tmpdir(), "aether-downloads");

/** Regex to parse yt-dlp progress lines like:
 *  [download]  45.2% of ~25.38MiB at 2.50MiB/s ETA 00:11 */
const PROGRESS_RE =
  /\[download\]\s+([\d.]+)% of ~?([\d.]+)\s*(\w+)\s+at\s+([\d.]+)\s*(\w+\/s)\s+ETA\s+(\S+)/;

/** Regex for final line: [download] 100% of ... in HH:MM */
const DONE_RE = /\[download\]\s+100%/;

export interface ProgressInfo {
  percent: number;
  speed: string;
  eta: string;
  totalSize: number;
}

export type ProgressCallback = (info: ProgressInfo) => void;

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

/** Parse a size string like "25.38MiB" → bytes */
function parseSize(value: number, unit: string): number {
  const units: Record<string, number> = {
    B: 1,
    KiB: 1024,
    MiB: 1024 * 1024,
    GiB: 1024 * 1024 * 1024,
    KB: 1000,
    MB: 1000 * 1000,
    GB: 1000 * 1000 * 1000,
  };
  return value * (units[unit] || 1);
}

export interface DownloadResult {
  /** Path to the downloaded file on disk */
  filePath: string;
  /** MIME type of the output file */
  mimeType: string;
  /** Whether audio was merged into the output */
  audioMerged: boolean;
}

function getYtDlpBinary(): string {
  return process.env.YTDLP_PATH || (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

function buildArgs(
  formatId: string,
  outputTemplate: string,
  isAudioAvailable: boolean,
  hasFfmpeg: boolean,
): string[] {
  const args: string[] = [
    "--no-playlist",
    "--no-warnings",
    "--newline", // Force per-line output for progress parsing
    "--print", "after_move:filepath",
    "-o", outputTemplate,
  ];

  if (!isAudioAvailable && hasFfmpeg) {
    args.push("--format", `${formatId}+bestaudio/best`);
    args.push("--merge-output-format", "mp4");
    logger.info({ formatId }, "Format has no audio — merging with best audio stream");
  } else if (!isAudioAvailable && !hasFfmpeg) {
    logger.warn(
      { formatId },
      "Format has no audio and ffmpeg is not available — downloading video-only stream",
    );
    args.push("--format", formatId);
  } else {
    args.push("--format", formatId);
  }

  return args;
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Downloads a video from a URL using yt-dlp, with real-time progress reporting.
 *
 * Spawns yt-dlp as a subprocess and parses stderr for [download] progress lines.
 * Calls `onProgress` whenever a new progress line is parsed.
 *
 * @param videoUrl - The original video URL
 * @param formatId - The yt-dlp format ID to download
 * @param isAudioAvailable - Whether the selected format already has audio
 * @param onProgress - Callback invoked with real-time progress info
 * @returns The path to the downloaded file and metadata
 */
export function downloadMediaWithProgress(
  videoUrl: string,
  formatId: string,
  isAudioAvailable: boolean,
  onProgress?: ProgressCallback,
): Promise<DownloadResult> {
  ensureTempDir();

  const safeId =
    videoUrl.split("/").pop()?.replace(/[^a-zA-Z0-9_-]/g, "") || `video-${Date.now()}`;
  const outputTemplate = join(TEMP_DIR, `${safeId}_${formatId}.%(ext)s`);

  return new Promise((resolve, reject) => {
    isFfmpegAvailable().then((hasFfmpeg) => {
      const args = buildArgs(formatId, outputTemplate, isAudioAvailable, hasFfmpeg);
      args.push(videoUrl);

      logger.info({ args, hasFfmpeg, isAudioAvailable }, "Downloading media with progress (yt-dlp)");

      const child = spawn(getYtDlpBinary(), args, {
        timeout: env.YTDLP_DOWNLOAD_TIMEOUT_MS,
      });

      let stdout = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (!onProgress) break;

          // Check for completion
          if (DONE_RE.test(line)) {
            continue;
          }

          // Parse progress line
          const match = line.match(PROGRESS_RE);
          if (match) {
            const percent = parseFloat(match[1]);
            const sizeVal = parseFloat(match[2]);
            const sizeUnit = match[3];
            const speedVal = match[4];
            const speedUnit = match[5];
            const eta = match[6];

            onProgress({
              percent,
              speed: `${speedVal} ${speedUnit}`,
              eta,
              totalSize: parseSize(sizeVal, sizeUnit),
            });
          }
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to start yt-dlp process: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(`yt-dlp exited with code ${code}`));
        }

        const outputPath = stdout.trim().split("\n").pop() || "";
        if (!outputPath || !existsSync(outputPath)) {
          return reject(new Error("Download completed but output file not found"));
        }

        const ext = outputPath.split(".").pop()?.toLowerCase() || "mp4";
        resolve({
          filePath: outputPath,
          mimeType: getMimeType(ext),
          audioMerged: !isAudioAvailable && hasFfmpeg,
        });
      });
    }).catch(reject);
  });
}

/**
 * Downloads a video from a URL using yt-dlp (legacy, without progress).
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
  const safeId =
    videoUrl.split("/").pop()?.replace(/[^a-zA-Z0-9_-]/g, "") || `video-${Date.now()}`;
  const outputTemplate = join(TEMP_DIR, `${safeId}_${formatId}.%(ext)s`);

  const args = buildArgs(formatId, outputTemplate, isAudioAvailable, hasFfmpeg);
  args.push(videoUrl);

  logger.info({ args, hasFfmpeg, isAudioAvailable }, "Downloading media with yt-dlp (legacy)");

  return new Promise((resolve, reject) => {
    const child = execFile(
      getYtDlpBinary(),
      args,
      { timeout: env.YTDLP_DOWNLOAD_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }

        const outputPath = stdout.trim().split("\n").pop() || "";
        if (!outputPath || !existsSync(outputPath)) {
          return reject(new Error("Download completed but output file not found"));
        }

        const ext = outputPath.split(".").pop()?.toLowerCase() || "mp4";
        resolve({
          filePath: outputPath,
          mimeType: getMimeType(ext),
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
