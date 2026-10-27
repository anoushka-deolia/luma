import http from 'node:http';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { config } from './config.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { startReminderScheduler } from './lib/scheduler.js';

async function main() {
  await connectDb(config.mongoUri);
  console.log('Connected to MongoDB');

  const app = createApp();
  const server = http.createServer(app);
  const io = attachRealtime(server);
  app.set('io', io);

  const stopScheduler = startReminderScheduler();

  server.listen(config.port, () => console.log(`Luma API listening on port ${config.port}`));

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    stopScheduler();
    io.close();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start Luma API:', err);
  process.exit(1);
});
