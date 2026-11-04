import mongoose from 'mongoose';

const cached = (globalThis.__taskflowMongo ??= { promise: null });

export function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env.');
  cached.promise ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 }).catch((err) => {
    cached.promise = null;
    throw err;
  });
  return cached.promise;
}

export async function disconnectDB() {
  cached.promise = null;
  await mongoose.disconnect();
}
