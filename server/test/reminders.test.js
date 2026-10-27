import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, signup } from './helpers.js';
import { isDue, localNow } from '../src/lib/reminders.js';
import { runReminderPass } from '../src/lib/scheduler.js';
import { setPushSender } from '../src/lib/push.js';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];
// 2026-10-27 15:35 UTC = 21:05 in India (a Tuesday)
const NOW = new Date('2026-10-27T15:35:00Z');

describe('reminder timing', () => {
  it('reads the local time in the reminder’s timezone', () => {
    expect(localNow(NOW, 'Asia/Kolkata')).toEqual({ date: '2026-10-27', weekday: 2, minutes: 21 * 60 + 5 });
  });

  it('is due shortly after its time, once per day, on chosen days only', () => {
    const r = { enabled: true, time: '21:00', days: ALL, timezone: 'Asia/Kolkata', lastSentDate: null };
    expect(isDue(r, NOW)).toBe(true);
    expect(isDue({ ...r, time: '21:10' }, NOW)).toBe(false); // not yet
    expect(isDue({ ...r, time: '20:00' }, NOW)).toBe(false); // too late to be gentle
    expect(isDue({ ...r, lastSentDate: '2026-10-27' }, NOW)).toBe(false);
    expect(isDue({ ...r, days: [1, 3] }, NOW)).toBe(false);
    expect(isDue({ ...r, enabled: false }, NOW)).toBe(false);
  });
});

describe('reminders API and scheduler', () => {
  const sent = [];
  beforeEach(() => {
    config.vapidPublicKey = 'BOr1C2nR0SZw6gJx3Ru0o8xQ7ZcVYz2L0V7mJ4Xc3bqfP8u5nXx2y9o9Wb5g3G6rTqV0p1kq2c7lQ0Y6y8x9z0A';
    config.vapidPrivateKey = 'x'.repeat(43);
    sent.length = 0;
    setPushSender(async (sub, payload) => {
      if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) });
    });
  });
  afterEach(() => {
    config.vapidPublicKey = '';
    config.vapidPrivateKey = '';
  });

  it('validates reminder settings', async () => {
    const { auth } = await signup();
    expect((await api().put('/api/reminders/checkin').set(auth).send({ time: '25:00', days: ALL, timezone: 'Asia/Kolkata' })).status).toBe(400);
    expect((await api().put('/api/reminders/checkin').set(auth).send({ time: '09:00', days: [], timezone: 'Asia/Kolkata' })).status).toBe(400);
    expect((await api().put('/api/reminders/checkin').set(auth).send({ time: '09:00', days: ALL, timezone: 'Mars/Base' })).status).toBe(400);
    expect((await api().put('/api/reminders/nope').set(auth).send({ time: '09:00', days: ALL, timezone: 'Asia/Kolkata' })).status).toBe(404);
  });

  it('sends a due reminder once to each device and drops revoked devices', async () => {
    const { auth, user } = await signup();
    await api().put('/api/reminders/journal').set(auth).send({ time: '21:00', days: ALL, timezone: 'Asia/Kolkata' }).expect(200);
    const sub = (endpoint) => ({ endpoint, keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) } });
    await api().post('/api/reminders/push/subscribe').set(auth).send(sub('https://push.example.com/phone')).expect(201);
    await api().post('/api/reminders/push/subscribe').set(auth).send(sub('https://push.example.com/gone')).expect(201);

    expect(await runReminderPass(NOW)).toBe(1);
    expect(sent[0]).toMatchObject({ title: 'Your page for today', url: '/journal' });
    expect(await runReminderPass(NOW)).toBe(0); // already sent today
    const fresh = await User.findById(user.id).select('+pushSubscriptions');
    expect(fresh.pushSubscriptions.map((s) => s.endpoint)).toEqual(['https://push.example.com/phone']);

    const list = (await api().get('/api/reminders').set(auth)).body;
    expect(list.push).toMatchObject({ available: true, devices: 1 });
    expect(list.reminders[0]).toMatchObject({ kind: 'journal', time: '21:00' });
  });
});
