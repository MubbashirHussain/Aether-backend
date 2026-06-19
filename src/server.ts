import { serve } from '@hono/node-server';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

logger.info(`Starting Aether Core Engine on runtime port ${env.PORT}`);

serve({
  fetch: app.fetch,
  port: env.PORT
});
