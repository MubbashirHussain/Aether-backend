import { execFile } from "child_process";
import { env } from "../config/env.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const findCookies = (): string | null => {
  const candidates = [
    path.resolve(process.cwd(), "../../cookies.txt"),
    path.resolve(process.cwd(), "cookies.txt"),
    path.resolve(process.cwd(), "../cookies.txt"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
};

export const execYtDlp = (url: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const args = ["--dump-single-json", "--no-playlist", "--no-warnings"];

    const cookiesFile = process.env.YTDLP_COOKIES_FILE || findCookies();
    if (cookiesFile) {
      args.push("--cookies", cookiesFile);
    }
    if (process.env.YTDLP_COOKIES_BROWSER) {
      args.push("--cookies-from-browser", process.env.YTDLP_COOKIES_BROWSER);
    }

    args.push(url);

    const binary =
      process.env.YTDLP_PATH ||
      (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

    const child = execFile(
      binary,
      args,
      { timeout: env.YTDLP_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr || error.message;
          return reject(new Error(msg.replace(/^ERROR:\s*/, "")));
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
          console.log({
            binary,
            cookiesFile,
            browserCookies: process.env.YTDLP_COOKIES_BROWSER,
            formats: parsed.formats.length,
          });
        } catch (parseError) {
          reject(
            new Error(
              `Failed to parse yt-dlp JSON output: ${parseError instanceof Error ? parseError.message : parseError}. Stderr: ${stderr.slice(0, 200)}`,
            ),
          );
        }
      },
    );
  });
};
