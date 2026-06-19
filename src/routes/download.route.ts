import { Hono } from 'hono';
import { downloadController } from '../controllers/download.controller.js';

const downloadRouter = new Hono();
downloadRouter.post('/', (c) => downloadController.analyze(c));
downloadRouter.post('/session', (c) => downloadController.startSession(c));
downloadRouter.post('/unlock', (c) => downloadController.verifyUnlock(c));
downloadRouter.post('/format', (c) => downloadController.downloadFormat(c));

export default downloadRouter;
