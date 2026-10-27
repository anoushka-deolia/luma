import { Router } from 'express';
import { z } from 'zod';
import { CheckIn } from '../models/CheckIn.js';
import { Session } from '../models/Session.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { Reminder } from '../models/Reminder.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addDays, daysBetween, localDate } from '../lib/localTime.js';
import { hasPassedToday } from '../lib/reminders.js';

const router = Router();
router.use(requireAuth);

const query = z.object({ date: localDate });

/**
 * What the home screen needs for gentle check-ins: today's check-in, whether
 * today's journal page exists, any reminder whose time has passed without the
 * thing being done, and at most one soft nudge. Nudges never guilt: someone
 * who was away is welcomed back, not told they broke a streak.
 */
router.get('/', validate(query, 'query'), async (req, res) => {
  const today = req.validatedQuery.date;
  const yesterday = addDays(today, -1);
  const user = req.userId;

  const [checkIn, yesterdayCheckIn, journaled, practisedToday, hardSessionYesterday, lastActive, reminders] =
    await Promise.all([
      CheckIn.findOne({ user, localDate: today }),
      CheckIn.findOne({ user, localDate: yesterday }),
      JournalEntry.exists({ user, kind: 'daily', localDate: today }),
      Session.exists({ user, localDate: today }),
      Session.exists({ user, localDate: yesterday, $or: [{ before: { $gte: 4 } }, { after: { $gte: 4 } }] }),
      Promise.all([
        Session.findOne({ user, localDate: { $lt: today } }).sort({ localDate: -1 }).select('localDate'),
        CheckIn.findOne({ user, localDate: { $lt: today } }).sort({ localDate: -1 }).select('localDate'),
        JournalEntry.findOne({ user, kind: 'daily', localDate: { $lt: today } }).sort({ localDate: -1 }).select('localDate'),
      ]),
      Reminder.find({ user, enabled: true }),
    ]);

  const lastActiveDate = lastActive.map((d) => d?.localDate).filter(Boolean).sort().at(-1) ?? null;
  const daysAway = lastActiveDate ? daysBetween(lastActiveDate, today) : null;

  let nudge = null;
  if (!checkIn && ((yesterdayCheckIn && yesterdayCheckIn.mood <= 2) || hardSessionYesterday)) {
    nudge = { kind: 'after-hard-day', message: 'Yesterday looked hard. How are you doing today?' };
  } else if (daysAway !== null && daysAway >= 3) {
    nudge = { kind: 'welcome-back', message: 'Good to see you. There is nothing to catch up on.' };
  }

  const done = { checkin: Boolean(checkIn), journal: Boolean(journaled), practice: Boolean(practisedToday) };
  const dueReminders = reminders.filter((r) => !done[r.kind] && hasPassedToday(r)).map((r) => r.kind);

  res.json({
    date: today,
    checkIn: checkIn ? { mood: checkIn.mood, tags: checkIn.tags } : null,
    journaledToday: done.journal,
    practisedToday: done.practice,
    lastActiveDate,
    daysAway,
    nudge,
    dueReminders,
  });
});

export default router;
