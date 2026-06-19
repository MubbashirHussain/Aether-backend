import { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';

export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (env.CORS_ORIGIN === '*') {
    c.header('Access-Control-Allow-Origin', '*');
  } else {
    c.header('Access-Control-Allow-Origin', env.CORS_ORIGIN);
  }

  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (c.req.method === 'OPTIONS') {
    return c.newResponse(null, 204);
  }

  await next();
};
