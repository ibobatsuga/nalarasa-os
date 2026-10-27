import { buildApp } from './app.js';
import { startScheduler } from './core/scheduler.js';

const app = await buildApp();
startScheduler(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
