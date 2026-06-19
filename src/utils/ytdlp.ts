import { execFile } from "child_process";
import { env } from "../config/env.js";

export const execYtDlp = (url: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const args = ["--dump-single-json", "--no-playlist", "--no-warnings", url];

    const child = execFile(
      "/opt/homebrew/bin/yt-dlp",
      args,
      { timeout: env.YTDLP_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (parseError) {
          reject(
            new Error(
              "Failed to serialize target payload extraction structural mapping downstream.",
            ),
          );
        }
      },
    );
  });
};
