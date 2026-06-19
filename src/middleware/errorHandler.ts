import { ErrorHandler } from 'hono';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  logger.error({ error: err.message, stack: err.stack }, 'Uncaught architectural pipeline runtime anomaly caught');
  return c.json({
    success: false,
    message: 'Unable to process or isolate remote video resource compilation execution streams properly.'
  }, 500);
};
