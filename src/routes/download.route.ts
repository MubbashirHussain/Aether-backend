import { Hono } from 'hono';
import { downloadController } from '../controllers/download.controller.js';

const downloadRouter = new Hono();
downloadRouter.post('/', (c) => downloadController.analyze(c));
downloadRouter.post('/raw', (c) => downloadController.downloadRaw(c));
downloadRouter.post('/session', (c) => downloadController.startSession(c));
downloadRouter.post('/unlock', (c) => downloadController.verifyUnlock(c));

// Legacy format download (no progress)
downloadRouter.post('/format', (c) => downloadController.downloadFormat(c));

// Progress-aware download flow
downloadRouter.post('/format/init', (c) => downloadController.initDownload(c));
downloadRouter.get('/format/progress/:downloadId', (c) => downloadController.streamProgress(c));
downloadRouter.get('/format/file/:downloadId', (c) => downloadController.downloadFile(c));
downloadRouter.get('/format/status/:downloadId', (c) => downloadController.downloadStatus(c));

// Stream (existing)
downloadRouter.get('/stream/:token', (c) => downloadController.streamVideo(c));

export default downloadRouter;
