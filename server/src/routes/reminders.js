import { Router } from 'express';
import { z } from 'zod';
import { Reminder, REMINDER_KINDS } from '../models/Reminder.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { isValidTimezone, REMINDER_COPY } from '../lib/reminders.js';
import { pushEnabled, sendToUser } from '../lib/push.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth);

const reminderBody = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 21:30.'),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Pick at least one day.')
    .max(7)
    .transform((d) => [...new Set(d)].sort()),
  timezone: z.string().max(64).refine(isValidTimezone, 'Unknown timezone.'),
  enabled: z.boolean().default(true),
});

const subscriptionBody = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

const toJson = (r) => ({
  kind: r.kind,
  time: r.time,
  days: r.days,
  timezone: r.timezone,
  enabled: r.enabled,
});

router.get('/', async (req, res) => {
  const [reminders, user] = await Promise.all([
    Reminder.find({ user: req.userId }),
    User.findById(req.userId).select('+pushSubscriptions'),
  ]);
  res.json({
    reminders: reminders.map(toJson),
    push: {
      available: pushEnabled(),
      publicKey: pushEnabled() ? config.vapidPublicKey : null,
      devices: user?.pushSubscriptions?.length ?? 0,
    },
  });
});

router.put('/:kind', validate(reminderBody), async (req, res) => {
  const { kind } = req.params;
  if (!REMINDER_KINDS.includes(kind)) throw notFound('Unknown reminder.');
  const reminder = await Reminder.findOneAndUpdate(
    { user: req.userId, kind },
    // A changed time should be able to fire again today.
    { $set: { ...req.body, lastSentDate: null } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  res.json({ reminder: toJson(reminder) });
});

router.delete('/:kind', async (req, res) => {
  const result = await Reminder.deleteOne({ user: req.userId, kind: req.params.kind });
  if (!result.deletedCount) throw notFound('That reminder is not set.');
  res.status(204).end();
});

// Notifications on this device: the browser gives us a subscription to send to.
router.post('/push/subscribe', validate(subscriptionBody), async (req, res) => {
  if (!pushEnabled()) throw badRequest('Notifications are not set up on this server.', 'PUSH_UNAVAILABLE');
  const { endpoint, keys } = req.body;
  await User.updateOne({ _id: req.userId }, { $pull: { pushSubscriptions: { endpoint } } });
  await User.updateOne(
    { _id: req.userId },
    { $push: { pushSubscriptions: { $each: [{ endpoint, ...keys }], $slice: -10 } } },
  );
  res.status(201).json({ ok: true });
});

router.post('/push/unsubscribe', validate(z.object({ endpoint: z.url().max(1000) })), async (req, res) => {
  await User.updateOne({ _id: req.userId }, { $pull: { pushSubscriptions: { endpoint: req.body.endpoint } } });
  res.status(204).end();
});

router.post('/push/test', async (req, res) => {
  if (!pushEnabled()) throw badRequest('Notifications are not set up on this server.', 'PUSH_UNAVAILABLE');
  const delivered = await sendToUser(req.userId, { ...REMINDER_COPY.checkin, title: 'Notifications are on', tag: 'luma-test' });
  if (!delivered) throw badRequest('No device is set up for notifications yet.', 'NO_DEVICES');
  res.json({ delivered });
});

export default router;
