import { Hono } from 'hono';
import { securityHeaders } from './middleware/security.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.route.js';
import downloadRouter from './routes/download.route.js';
import adsRouter from './routes/ads.route.js';
import analyticsRouter from './routes/analytics.route.js';

const app = new Hono();

app.use('*', securityHeaders());
app.use('*', requestLogger());
app.use('/api/*', rateLimiter());

app.route('/health', healthRouter);
app.route('/api/download', downloadRouter);
app.route('/api/ads', adsRouter);
app.route('/api/analytics', analyticsRouter);

app.onError(errorHandler);

export default app;
