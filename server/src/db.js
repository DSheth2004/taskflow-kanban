import mongoose from 'mongoose';

// Serverless functions are re-invoked in the same process while warm, so the connection
// promise is cached on globalThis to avoid opening a new pool on every request.
const cached = (globalThis.__taskflowMongo ??= { promise: null });

export function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env.');
  cached.promise ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 }).catch((err) => {
    cached.promise = null; // let the next request retry instead of caching the failure
    throw err;
  });
  return cached.promise;
}

export async function disconnectDB() {
  cached.promise = null;
  await mongoose.disconnect();
}
