import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Session } from '../models/Session.js';
import { CheckIn } from '../models/CheckIn.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { TECHNIQUES } from '../lib/techniques.js';
import { profileWithRanking, sessionStatsFor } from '../lib/ranking.js';
import {
  TIME_BUCKETS,
  addDays,
  bucketForHour,
  computeStreaks,
  localDate,
  localHour,
  utcDate,
} from '../lib/localTime.js';

const router = Router();
router.use(requireAuth);

const rating = z.number().int().min(1).max(5);

const sessionBody = z.object({
  technique: z.enum(TECHNIQUES),
  before: rating,
  after: rating,
  clientId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9-]+$/),
  // Ratings saved offline arrive later, so the device sends when it happened.
  occurredAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 5 * 60 * 1000, 'Date is in the future.')
    .refine((d) => d.getTime() >= Date.now() - 365 * 24 * 60 * 60 * 1000, 'Date is too old.')
    .optional(),
  localDate: localDate.optional(),
  localHour: localHour.optional(),
});

const trendsQuery = z.object({
  today: localDate,
  days: z.coerce.number().int().min(7).max(120).default(30),
});

function toJson(s) {
  return {
    id: s._id.toString(),
    technique: s.technique,
    before: s.before,
    after: s.after,
    improvement: s.before - s.after,
    clientId: s.clientId,
    occurredAt: s.occurredAt,
    localDate: s.localDate ?? utcDate(s.occurredAt),
    timeOfDay: s.timeOfDay ?? null,
  };
}

router.post('/', validate(sessionBody), async (req, res) => {
  const { clientId, occurredAt = new Date(), localDate: day, localHour: hour, ...rest } = req.body;
  const existing = await Session.findOne({ user: req.userId, clientId });
  if (existing) {
    // A retry of a rating that already reached the server: answer as if new.
    return res.status(200).json({ session: toJson(existing), duplicate: true, ...(await profileWithRanking(req.userId)) });
  }
  const timeFields = {
    localDate: day ?? utcDate(occurredAt),
    ...(hour !== undefined ? { localHour: hour, timeOfDay: bucketForHour(hour) } : {}),
  };
  let session;
  try {
    session = await Session.create({ ...rest, ...timeFields, clientId, occurredAt, user: req.userId });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // Two retries raced each other; the other one won.
    session = await Session.findOne({ user: req.userId, clientId });
    return res.status(200).json({ session: toJson(session), duplicate: true, ...(await profileWithRanking(req.userId)) });
  }
  res.status(201).json({ session: toJson(session), duplicate: false, ...(await profileWithRanking(req.userId)) });
});

router.get('/', async (req, res) => {
  const sessions = await Session.find({ user: req.userId }).sort({ occurredAt: -1 }).limit(100);
  res.json({ sessions: sessions.map(toJson) });
});

// Data for the per-technique chart: average distress before and after.
router.get('/stats', async (req, res) => {
  const stats = await sessionStatsFor(req.userId);
  const techniques = TECHNIQUES.map((technique) => {
    const s = stats[technique];
    return {
      technique,
      sessions: s?.sessions ?? 0,
      avgBefore: s ? Math.round(s.avgBefore * 10) / 10 : null,
      avgAfter: s ? Math.round(s.avgAfter * 10) / 10 : null,
      avgImprovement: s ? Math.round((s.sumImprovement / s.sessions) * 100) / 100 : null,
    };
  });
  const totalSessions = techniques.reduce((n, t) => n + t.sessions, 0);
  res.json({ techniques, totalSessions });
});

const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

/**
 * Everything the progress page draws: a day-by-day series (sessions, average
 * distress before/after, mood, whether a journal page was written), streaks
 * of days the person showed up, and which technique helps most at each time
 * of day.
 */
router.get('/trends', validate(trendsQuery, 'query'), async (req, res) => {
  const { today, days } = req.validatedQuery;
  const from = addDays(today, -(days - 1));
  const user = new mongoose.Types.ObjectId(req.userId);

  const [daily, checkins, journalDays, allActive, byTimeRows] = await Promise.all([
    Session.aggregate([
      { $match: { user, localDate: { $gte: from, $lte: today } } },
      {
        $group: {
          _id: '$localDate',
          sessions: { $sum: 1 },
          avgBefore: { $avg: '$before' },
          avgAfter: { $avg: '$after' },
        },
      },
    ]),
    CheckIn.find({ user, localDate: { $gte: from, $lte: today } }).select('localDate mood tags'),
    JournalEntry.distinct('localDate', { user, kind: 'daily', localDate: { $gte: from, $lte: today } }),
    // Streaks look at all history, not just the chart window.
    Promise.all([
      Session.distinct('localDate', { user }),
      CheckIn.distinct('localDate', { user }),
      JournalEntry.distinct('localDate', { user, kind: 'daily' }),
    ]),
    Session.aggregate([
      { $match: { user, timeOfDay: { $in: TIME_BUCKETS } } },
      {
        $group: {
          _id: { time: '$timeOfDay', technique: '$technique' },
          sessions: { $sum: 1 },
          avgImprovement: { $avg: { $subtract: ['$before', '$after'] } },
        },
      },
    ]),
  ]);

  const sessionsByDay = Object.fromEntries(daily.map((d) => [d._id, d]));
  const checkinByDay = Object.fromEntries(checkins.map((c) => [c.localDate, c]));
  const journalSet = new Set(journalDays);

  const series = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(from, i);
    const s = sessionsByDay[date];
    series.push({
      date,
      sessions: s?.sessions ?? 0,
      avgBefore: round1(s?.avgBefore),
      avgAfter: round1(s?.avgAfter),
      mood: checkinByDay[date]?.mood ?? null,
      journaled: journalSet.has(date),
    });
  }

  const activeDates = [...new Set(allActive.flat().filter(Boolean))];
  const streak = computeStreaks(activeDates, today);

  const byTime = Object.fromEntries(TIME_BUCKETS.map((b) => [b, []]));
  for (const row of byTimeRows) {
    byTime[row._id.time].push({
      technique: row._id.technique,
      sessions: row.sessions,
      avgImprovement: Math.round(row.avgImprovement * 100) / 100,
    });
  }
  for (const bucket of TIME_BUCKETS) byTime[bucket].sort((a, b) => b.avgImprovement - a.avgImprovement);

  const tagCounts = {};
  for (const c of checkins) for (const t of c.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;

  res.json({
    from,
    today,
    series,
    streak,
    activeDays: activeDates.filter((d) => d >= from && d <= today).length,
    byTime,
    tagCounts,
  });
});

export default router;
