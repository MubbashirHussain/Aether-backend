import { Hono } from 'hono';

const healthRouter = new Hono();
healthRouter.get('/', (c) => c.json({ status: 'healthy', uptime: process.uptime() }));

export default healthRouter;
