import { z } from 'zod';

// The server never guesses a person's timezone. The app sends the local date
// and hour of each event, so "today", streaks and time-of-day suggestions match
// what the person actually experienced.

export const TIME_BUCKETS = ['morning', 'afternoon', 'evening', 'night'];

export const BUCKET_LABELS = {
  morning: 'mornings',
  afternoon: 'afternoons',
  evening: 'evenings',
  night: 'nights',
};

export function bucketForHour(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const isRealDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date like 2026-10-27.')
  .refine(isRealDate, 'That date does not exist.');

export const localHour = z.number().int().min(0).max(23);

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Fallback for older records without a local date: use UTC. */
export const utcDate = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Streaks over a set of active dates (YYYY-MM-DD). The current streak counts
 * back from today, or from yesterday if today has no activity yet, so a streak
 * isn't "broken" in the morning before the person has opened the app.
 */
export function computeStreaks(activeDates, today) {
  const days = new Set(activeDates);
  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, activeToday: days.has(today) };
}
