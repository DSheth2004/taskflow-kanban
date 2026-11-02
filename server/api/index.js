// Vercel serverless entry: Vercel calls the exported Express app as a request handler.
// app.listen() is only used locally (src/index.js).
import { createApp } from '../src/app.js';
import { connectDB } from '../src/db.js';

export default createApp({
  beforeRoutes: async (_req, _res, next) => {
    await connectDB(); // cached after the first call in a warm instance
    next();
  },
});
