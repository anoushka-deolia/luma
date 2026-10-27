import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { addDays, localDate } from '../lib/localTime.js';

const router = Router();
router.use(requireAuth);

const base64 = (min, max) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Expected encrypted data.');

// AES-GCM uses a 12-byte IV (16 base64 chars). Salts are 16 bytes (24 chars).
const iv = base64(16, 16);

const setupBody = z.object({
  salt: base64(24, 24),
  verifierCiphertext: base64(16, 200),
  verifierIv: iv,
});

// ~60 KB of ciphertext is roughly 45,000 characters of writing.
const entryBody = z.object({
  ciphertext: base64(24, 60_000),
  iv,
  localDate: localDate.optional(),
});

const dailyBody = z.object({
  ciphertext: base64(24, 60_000),
  iv,
  promptId: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
});

const pageQuery = z.object({
  before: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const rangeQuery = z.object({
  today: localDate,
  days: z.coerce.number().int().min(1).max(370).default(42),
});

function toJson(entry) {
  return {
    id: entry._id.toString(),
    kind: entry.kind ?? 'note',
    localDate: entry.localDate ?? null,
    promptId: entry.promptId ?? null,
    ciphertext: entry.ciphertext,
    iv: entry.iv,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function requireJournal(userId) {
  const user = await User.findById(userId);
  if (!user) throw notFound('This account no longer exists.');
  if (!user.journalKey) throw badRequest('Set a journal passphrase first.', 'JOURNAL_NOT_SET_UP');
  return user;
}

router.get('/meta', async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw notFound('This account no longer exists.');
  res.json({ journalKey: user.journalKey ?? null });
});

router.post('/setup', validate(setupBody), async (req, res) => {
  // Only set the key once: replacing it would make every existing entry unreadable.
  const user = await User.findOneAndUpdate(
    { _id: req.userId, journalKey: null },
    { $set: { journalKey: req.body } },
    { returnDocument: 'after' },
  );
  if (!user) throw conflict('Your journal already has a passphrase.', 'JOURNAL_EXISTS');
  res.status(201).json({ journalKey: user.journalKey });
});

// ---------- Free notes ----------

router.get('/entries', validate(pageQuery, 'query'), async (req, res) => {
  await requireJournal(req.userId);
  const { before, limit } = req.validatedQuery;
  const filter = {
    user: req.userId,
    kind: { $ne: 'daily' },
    ...(before ? { _id: { $lt: before } } : {}),
  };
  const entries = await JournalEntry.find(filter).sort({ _id: -1 }).limit(limit + 1);
  res.json({
    entries: entries.slice(0, limit).map(toJson),
    hasMore: entries.length > limit,
  });
});

router.post('/entries', validate(entryBody), async (req, res) => {
  await requireJournal(req.userId);
  const entry = await JournalEntry.create({ ...req.body, kind: 'note', user: req.userId });
  res.status(201).json({ entry: toJson(entry) });
});

router.delete('/entries/:id', async (req, res) => {
  // Filtering on user as well as id means one person can never delete another's entry.
  const result = await JournalEntry.deleteOne({ _id: req.params.id, user: req.userId });
  if (!result.deletedCount) throw notFound('That entry no longer exists.');
  res.status(204).end();
});

// ---------- Daily pages: one per day ----------

// Which days have a page, for the calendar. Returns ciphertext too, so the
// app can decrypt a past page without another request.
router.get('/daily', validate(rangeQuery, 'query'), async (req, res) => {
  await requireJournal(req.userId);
  const { today, days } = req.validatedQuery;
  const pages = await JournalEntry.find({
    user: req.userId,
    kind: 'daily',
    localDate: { $gte: addDays(today, -(days - 1)), $lte: today },
  }).sort({ localDate: -1 });
  res.json({ pages: pages.map(toJson) });
});

router.get('/daily/:date', async (req, res) => {
  const date = localDate.safeParse(req.params.date);
  if (!date.success) throw badRequest('That date is not valid.');
  await requireJournal(req.userId);
  const page = await JournalEntry.findOne({ user: req.userId, kind: 'daily', localDate: date.data });
  res.json({ page: page ? toJson(page) : null });
});

// Write or rewrite the page for one day.
router.put('/daily/:date', validate(dailyBody), async (req, res) => {
  const date = localDate.safeParse(req.params.date);
  if (!date.success) throw badRequest('That date is not valid.');
  await requireJournal(req.userId);
  const page = await JournalEntry.findOneAndUpdate(
    { user: req.userId, kind: 'daily', localDate: date.data },
    { $set: { ciphertext: req.body.ciphertext, iv: req.body.iv, promptId: req.body.promptId } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  res.json({ page: toJson(page) });
});

router.delete('/daily/:date', async (req, res) => {
  const result = await JournalEntry.deleteOne({ user: req.userId, kind: 'daily', localDate: req.params.date });
  if (!result.deletedCount) throw notFound('There is no page for that day.');
  res.status(204).end();
});

export default router;
