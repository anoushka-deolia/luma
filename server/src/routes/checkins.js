import { Router } from 'express';
import { z } from 'zod';
import { CheckIn, CHECKIN_TAGS } from '../models/CheckIn.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addDays, localDate } from '../lib/localTime.js';

const router = Router();
router.use(requireAuth);

const body = z.object({
  localDate,
  mood: z.number().int().min(1).max(5),
  tags: z
    .array(z.enum(CHECKIN_TAGS))
    .max(CHECKIN_TAGS.length)
    .default([])
    .transform((t) => [...new Set(t)]),
});

const listQuery = z.object({
  today: localDate,
  days: z.coerce.number().int().min(1).max(120).default(30),
});

const toJson = (c) => ({ localDate: c.localDate, mood: c.mood, tags: c.tags, updatedAt: c.updatedAt });

// Save today's check-in, or change it if the person checks in again the same day.
router.put('/', validate(body), async (req, res) => {
  const { localDate: day, mood, tags } = req.body;
  const checkIn = await CheckIn.findOneAndUpdate(
    { user: req.userId, localDate: day },
    { $set: { mood, tags } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  res.json({ checkIn: toJson(checkIn) });
});

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { today, days } = req.validatedQuery;
  const checkIns = await CheckIn.find({
    user: req.userId,
    localDate: { $gte: addDays(today, -(days - 1)), $lte: today },
  }).sort({ localDate: -1 });
  res.json({ checkIns: checkIns.map(toJson) });
});

export default router;
