import { logger } from "./logger.js";
import { env } from "../config/env.js";

const URL_TEST_TIMEOUT_MS = env.URL_TEST_TIMEOUT_MS;

export interface UrlTestResult {
  urlTested: boolean;
  urlWorking: boolean;
}

/**
 * Tests a single URL by sending an HTTP HEAD request.
 * Returns whether the URL was tested and whether it responded successfully (2xx).
 */
async function testSingleUrl(url: string): Promise<UrlTestResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_TEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    return {
      urlTested: true,
      urlWorking: response.ok || response.status === 206, // 206 = partial content (common for media streams)
    };
  } catch (error) {
    logger.debug({ url, error: (error as Error).message }, "URL test failed");
    return {
      urlTested: true,
      urlWorking: false,
    };
  }
}

/**
 * Tests an array of format URLs in parallel.
 * Returns a Map of url -> UrlTestResult for quick lookup.
 */
export async function testFormatUrls(
  urls: string[],
): Promise<Map<string, UrlTestResult>> {
  const uniqueUrls = [...new Set(urls)];
  const results = await Promise.allSettled(
    uniqueUrls.map(async (url) => ({
      url,
      result: await testSingleUrl(url),
    })),
  );

  const resultMap = new Map<string, UrlTestResult>();
  for (const entry of results) {
    if (entry.status === "fulfilled") {
      resultMap.set(entry.value.url, entry.value.result);
    }
  }

  return resultMap;
}

/**
 * Tests a single URL. Convenience wrapper when you only need one.
 */
export async function testUrl(url: string): Promise<UrlTestResult> {
  return testSingleUrl(url);
}
