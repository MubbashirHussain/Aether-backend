import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  CACHE_TTL_MINUTES: z.string().transform(Number).default('30'),
  RATE_LIMIT_REQUESTS: z.string().transform(Number).default('20'),
  RATE_LIMIT_WINDOW_MINUTES: z.string().transform(Number).default('1'),
  MAX_CONCURRENT_JOBS: z.string().transform(Number).default('3'),
  YTDLP_TIMEOUT_MS: z.string().transform(Number).default('30000'),
  YTDLP_DOWNLOAD_TIMEOUT_MS: z.string().transform(Number).default('120000'),
  DOWNLOAD_UNLOCK_SECONDS: z.string().transform(Number).default('5'),
  TEMP_DIR: z.string().optional(),
  URL_TEST_TIMEOUT_MS: z.string().transform(Number).default('5000'),
});

export const env = envSchema.parse(process.env);
