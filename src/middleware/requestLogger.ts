import { MiddlewareHandler } from 'hono';
import { logger } from '../utils/logger.js';

export const requestLogger = (): MiddlewareHandler => async (c, next) => {
  const { method, url } = c.req;
  const startTime = Date.now();
  logger.info({ method, url }, 'Incoming network verification process execution triggered');
  await next();
  const duration = Date.now() - startTime;
  logger.info({ method, url, status: c.res.status, duration: `${duration}ms` }, 'Egress application cycle finalized');
};
