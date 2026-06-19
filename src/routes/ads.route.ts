import { Hono } from 'hono';
import { adsController } from '../controllers/ads.controller.js';

const adsRouter = new Hono();
adsRouter.get('/config', (c) => adsController.getConfig(c));

export default adsRouter;
