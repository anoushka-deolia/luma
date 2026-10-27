import path from 'node:path';
import 'dotenv/config';

function required(name, fallbackForTests) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'test' && fallbackForTests) return fallbackForTests;
  throw new Error(`Missing required environment variable ${name}. See server/.env.example.`);
}

export const config = {
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/luma_test'),
  jwtSecret: required('JWT_SECRET', 'test-jwt-secret'),
  handleSecret: required('HANDLE_SECRET', 'test-handle-secret'),
  // Render sets RENDER_EXTERNAL_URL, so a single-service deploy (API and
  // website together) needs no extra setting.
  clientOrigins: [process.env.CLIENT_ORIGIN || 'http://localhost:5173', process.env.RENDER_EXTERNAL_URL || '']
    .join(',')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  port: Number(process.env.PORT) || 4000,
  // Accounts with these emails become moderators when they sign up or log in.
  moderatorEmails: (process.env.MODERATOR_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Web Push for reminders (optional). Generate with: npm run vapid
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:luma@example.com',
  // Set to a built client folder (e.g. ../client/dist) to serve the PWA from the API server.
  clientDist: process.env.CLIENT_DIST ? path.resolve(process.env.CLIENT_DIST) : '',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};
