import { describe, expect, it } from 'vitest';
import { api, signup } from './helpers.js';
import { addDays, bucketForHour, computeStreaks } from '../src/lib/localTime.js';
import { rankForTime } from '../src/lib/techniques.js';

const TODAY = '2026-10-27';
const key = { salt: 'A'.repeat(22) + '==', verifierCiphertext: 'B'.repeat(40), verifierIv: 'C'.repeat(16) };
const sealed = (c = 'D') => ({ ciphertext: c.repeat(64), iv: 'E'.repeat(16) });
let n = 0;
const session = (extra) => ({ technique: 'pmr', before: 4, after: 2, clientId: `w-${++n}-${Date.now()}`, localDate: TODAY, localHour: 10, ...extra });

describe('local time helpers', () => {
  it('buckets hours into times of day', () => {
    expect([5, 11, 12, 16, 17, 21, 22, 2].map(bucketForHour)).toEqual(
      ['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night'],
    );
  });

  it('counts a streak back from today, or from yesterday before today has activity', () => {
    const days = [TODAY, addDays(TODAY, -1), addDays(TODAY, -2), addDays(TODAY, -5)];
    expect(computeStreaks(days, TODAY)).toMatchObject({ current: 3, longest: 3, activeToday: true });
    expect(computeStreaks(days.slice(1), TODAY)).toMatchObject({ current: 2, activeToday: false });
    expect(computeStreaks([addDays(TODAY, -3)], TODAY).current).toBe(0);
  });

  it('time-of-day ranking falls back to overall and shifts with evidence', () => {
    const overall = [
      { technique: 'pacer', score: 1.5 },
      { technique: 'pmr', score: 1.2 },
    ];
    expect(rankForTime(overall, {})[0].technique).toBe('pacer');
    const night = rankForTime(overall, { pmr: { sessions: 3, sumImprovement: 9 }, pacer: { sessions: 2, sumImprovement: 0 } });
    expect(night[0].technique).toBe('pmr');
  });
});

describe('time-of-day go-to', () => {
  it('suggests a different technique at night when night sessions show it helps more', async () => {
    const { auth } = await signup();
    await api().put('/api/profile/practice').set(auth).send({ technique: 'pacer', rating: 5 });
    await api().post('/api/profile/complete').set(auth);
    // Mental grounding helps at night but not in the morning; the pacer is the opposite.
    for (let i = 0; i < 3; i += 1) {
      await api().post('/api/sessions').set(auth).send(session({ technique: 'mental-grounding', before: 5, after: 2, localHour: 23 }));
      await api().post('/api/sessions').set(auth).send(session({ technique: 'mental-grounding', before: 3, after: 3, localHour: 9 }));
      await api().post('/api/sessions').set(auth).send(session({ technique: 'pacer', before: 5, after: 2, localHour: 9 }));
      await api().post('/api/sessions').set(auth).send(session({ technique: 'pacer', before: 3, after: 3, localHour: 23 }));
    }
    const profile = (await api().get('/api/profile').set(auth)).body;
    expect(profile.byTime.night.goTo).toBe('mental-grounding');
    expect(profile.byTime.night.reason).toMatchObject({ technique: 'mental-grounding', sessions: 3, avgImprovement: 3 });
    expect(profile.byTime.morning.goTo).toBe('pacer');
  });
});

describe('check-ins', () => {
  it('saves one check-in per day and updates it', async () => {
    const { auth } = await signup();
    await api().put('/api/checkins').set(auth).send({ localDate: TODAY, mood: 2, tags: ['poor-sleep'] }).expect(200);
    await api().put('/api/checkins').set(auth).send({ localDate: TODAY, mood: 3, tags: ['poor-sleep', 'hopeful', 'hopeful'] }).expect(200);
    const list = (await api().get(`/api/checkins?today=${TODAY}`).set(auth)).body.checkIns;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ mood: 3, tags: ['poor-sleep', 'hopeful'] });
  });

  it('rejects impossible dates and unknown tags', async () => {
    const { auth } = await signup();
    expect((await api().put('/api/checkins').set(auth).send({ localDate: '2026-02-30', mood: 3 })).status).toBe(400);
    expect((await api().put('/api/checkins').set(auth).send({ localDate: TODAY, mood: 3, tags: ['nope'] })).status).toBe(400);
  });
});

describe('today and gentle nudges', () => {
  it('asks how someone is after a hard day, and welcomes them back after time away', async () => {
    const a = await signup();
    await api().put('/api/checkins').set(a.auth).send({ localDate: addDays(TODAY, -1), mood: 1 });
    const hard = (await api().get(`/api/today?date=${TODAY}`).set(a.auth)).body;
    expect(hard.nudge.kind).toBe('after-hard-day');
    await api().put('/api/checkins').set(a.auth).send({ localDate: TODAY, mood: 3 });
    expect((await api().get(`/api/today?date=${TODAY}`).set(a.auth)).body.nudge).toBeNull();

    const b = await signup();
    await api().post('/api/sessions').set(b.auth).send(session({ localDate: addDays(TODAY, -6) }));
    const back = (await api().get(`/api/today?date=${TODAY}`).set(b.auth)).body;
    expect(back).toMatchObject({ daysAway: 6, nudge: { kind: 'welcome-back' } });
  });

  it('lists reminders whose time has passed but are not done yet', async () => {
    const { auth } = await signup();
    const all = [0, 1, 2, 3, 4, 5, 6];
    await api().put('/api/reminders/checkin').set(auth).send({ time: '00:00', days: all, timezone: 'Asia/Kolkata' }).expect(200);
    await api().put('/api/reminders/journal').set(auth).send({ time: '00:00', days: all, timezone: 'Asia/Kolkata', enabled: false });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    expect((await api().get(`/api/today?date=${today}`).set(auth)).body.dueReminders).toEqual(['checkin']);
    await api().put('/api/checkins').set(auth).send({ localDate: today, mood: 4 });
    expect((await api().get(`/api/today?date=${today}`).set(auth)).body.dueReminders).toEqual([]);
  });
});

describe('daily journal', () => {
  it('keeps one encrypted page per day that can be rewritten', async () => {
    const { auth } = await signup();
    await api().post('/api/journal/setup').set(auth).send(key);
    await api().put(`/api/journal/daily/${TODAY}`).set(auth).send({ ...sealed('D'), promptId: 'one-okay-thing' }).expect(200);
    await api().put(`/api/journal/daily/${TODAY}`).set(auth).send(sealed('F')).expect(200);
    await api().put(`/api/journal/daily/${addDays(TODAY, -2)}`).set(auth).send(sealed('G')).expect(200);

    const { pages } = (await api().get(`/api/journal/daily?today=${TODAY}`).set(auth)).body;
    expect(pages.map((p) => p.localDate)).toEqual([TODAY, addDays(TODAY, -2)]);
    expect(pages[0].ciphertext.startsWith('F')).toBe(true);
    const one = (await api().get(`/api/journal/daily/${TODAY}`).set(auth)).body.page;
    expect(one.kind).toBe('daily');
    // Daily pages don't appear among free notes.
    expect((await api().get('/api/journal/entries').set(auth)).body.entries).toHaveLength(0);
  });

  it('rejects a bad date', async () => {
    const { auth } = await signup();
    await api().post('/api/journal/setup').set(auth).send(key);
    expect((await api().put('/api/journal/daily/yesterday').set(auth).send(sealed())).status).toBe(400);
  });
});

describe('progress trends', () => {
  it('returns a daily series, streaks and time-of-day breakdown', async () => {
    const { auth } = await signup();
    await api().post('/api/journal/setup').set(auth).send(key);
    await api().post('/api/sessions').set(auth).send(session({ before: 5, after: 1, localHour: 22 }));
    await api().post('/api/sessions').set(auth).send(session({ before: 3, after: 2, localHour: 22 }));
    await api().put('/api/checkins').set(auth).send({ localDate: addDays(TODAY, -1), mood: 2, tags: ['poor-sleep'] });
    await api().put(`/api/journal/daily/${addDays(TODAY, -2)}`).set(auth).send(sealed());

    const t = (await api().get(`/api/sessions/trends?today=${TODAY}&days=14`).set(auth)).body;
    expect(t.series).toHaveLength(14);
    expect(t.series.at(-1)).toMatchObject({ date: TODAY, sessions: 2, avgBefore: 4, avgAfter: 1.5 });
    expect(t.series.at(-2)).toMatchObject({ mood: 2 });
    expect(t.series.at(-3)).toMatchObject({ journaled: true });
    expect(t.streak).toMatchObject({ current: 3, longest: 3, activeToday: true });
    expect(t.byTime.night[0]).toMatchObject({ technique: 'pmr', sessions: 2, avgImprovement: 2.5 });
    expect(t.tagCounts).toEqual({ 'poor-sleep': 1 });
  });
});
