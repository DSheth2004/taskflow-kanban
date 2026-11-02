import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './db.js';

const port = Number(process.env.PORT) || 4000;

await connectDB();
createApp().listen(port, () => {
  console.log(`TaskFlow API listening on http://localhost:${port}`);
});
