import { createApp } from '../src/app.js';
import { connectDB } from '../src/db.js';

export default createApp({
  beforeRoutes: async (_req, _res, next) => {
    await connectDB();
    next();
  },
});
