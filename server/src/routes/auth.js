import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { TechniqueProfile } from '../models/TechniqueProfile.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimits.js';
import { conflict, notFound, unauthorized } from '../lib/errors.js';
import { config } from '../config.js';

const router = Router();

// Accounts listed in MODERATOR_EMAILS are made moderators when they sign up or log in.
async function applyRole(user) {
  if (user.role !== 'moderator' && config.moderatorEmails.includes(user.email)) {
    user.role = 'moderator';
    await user.save();
  }
  return user;
}

const credentials = z.object({
  email: z.email('Please enter a valid email address.').trim().toLowerCase().max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be at most 128 characters.'),
});

router.post('/signup', authLimiter, validate(credentials), async (req, res) => {
  const { email, password } = req.body;
  if (await User.exists({ email })) {
    throw conflict('An account with this email already exists. Try logging in.', 'EMAIL_TAKEN');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await User.create({ email, passwordHash });
  } catch (err) {
    if (err?.code === 11000) {
      throw conflict('An account with this email already exists. Try logging in.', 'EMAIL_TAKEN');
    }
    throw err;
  }
  await TechniqueProfile.create({ user: user._id });
  await applyRole(user);
  res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
});

router.post('/login', authLimiter, validate(credentials), async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for an unknown email and a wrong password, so the login form
  // can't be used to find out who has an account.
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw unauthorized('That email and password do not match.');
  await applyRole(user);
  res.json({ token: signToken(user._id), user: user.toPublic() });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw notFound('This account no longer exists.');
  res.json({ user: user.toPublic() });
});

router.post('/guidelines', requireAuth, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $set: { guidelinesAcceptedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!user) throw notFound('This account no longer exists.');
  res.json({ user: user.toPublic() });
});

export default router;
