import { MiddlewareHandler } from 'hono';
import { RateLimitInfo } from '../types/index.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const rateLimitMap = new Map<string, RateLimitInfo>();
const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

export const rateLimiter = (): MiddlewareHandler => async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return await next();
  }

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return await next();
  }

  record.count++;
  if (record.count > env.RATE_LIMIT_REQUESTS) {
    logger.warn({ ip, count: record.count }, 'In-memory rate limiting boundary breached');
    return c.json({ success: false, message: 'Too many requests. Rate limit exceeded.' }, 429);
  }

  await next();
};
