import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config.js';

function limiter({ windowMs, limit, message, perUser = false }) {
  return rateLimit({
    windowMs,
    // Tests turn limits off unless a test is checking the limits themselves.
    limit: () => (config.isTest && !process.env.TEST_RATE_LIMITS ? 10_000 : limit),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => (perUser && req.userId ? `user:${req.userId}` : ipKeyGenerator(req.ip)),
    handler: (_req, res) => res.status(429).json({ error: message, code: 'RATE_LIMITED' }),
  });
}

export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

export const postLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 3,
  perUser: true,
  message: 'Please wait a moment before posting again.',
});

export const replyLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 8,
  perUser: true,
  message: 'Please wait a moment before replying again.',
});

export const reportLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  perUser: true,
  message: 'You have sent a lot of reports. Please try again later.',
});

export const reactionLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 40,
  perUser: true,
  message: 'You are reacting very quickly. Please slow down a little.',
});

export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: 'Too many requests. Please slow down.',
});
