import { Hono } from 'hono';
import { analyticsController } from '../controllers/analytics.controller.js';
import { zValidator } from '@hono/zod-validator';
import { trackEventSchema } from '../schemas/analytics.schema.js';

const analyticsRouter = new Hono();
analyticsRouter.post('/', zValidator('json', trackEventSchema), (c) => analyticsController.track(c));
analyticsRouter.get('/stats', (c) => analyticsController.getStats(c));

export default analyticsRouter;
