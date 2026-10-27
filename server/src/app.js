import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import sessionRoutes from './routes/sessions.js';
import journalRoutes from './routes/journal.js';
import postRoutes, { reportsRouter } from './routes/posts.js';
import checkinRoutes from './routes/checkins.js';
import todayRoutes from './routes/today.js';
import reminderRoutes from './routes/reminders.js';
import moderationRoutes from './routes/moderation.js';
import { apiLimiter } from './middleware/rateLimits.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render and Vercel sit behind one proxy hop
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server requests have no Origin header.
        if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/journal', journalRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/reports', reportsRouter);
  app.use('/api/checkins', checkinRoutes);
  app.use('/api/today', todayRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/moderation', moderationRoutes);

  app.use('/api', notFoundHandler);

  // Optional single-service deploy: serve the built PWA from this server.
  if (config.clientDist && fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) =>
      res.sendFile(path.join(config.clientDist, 'index.html')),
    );
  }

  app.use(errorHandler);
  return app;
}
