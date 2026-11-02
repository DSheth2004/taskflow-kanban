import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { chaos } from './middleware/chaos.js';
import { errorHandler, notFoundRoute } from './middleware/errorHandler.js';

export function createApp({ beforeRoutes } = {}) {
  const app = express();
  const origins = process.env.CORS_ORIGIN?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(cors({ origin: origins?.length ? origins : true }));
  app.use(express.json({ limit: '100kb' }));
  if (beforeRoutes) app.use(beforeRoutes);
  app.use('/api', chaos, router);
  app.use(notFoundRoute);
  app.use(errorHandler);
  return app;
}
