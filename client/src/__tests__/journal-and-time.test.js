import { describe, expect, it } from 'vitest';
import { PROMPTS, promptIndexForDate } from '../lib/prompts.js';
import { addDays, timeOfDay, todayLocal } from '../lib/time.js';

describe('daily prompts', () => {
  it('keeps the same prompt all day and varies across days', () => {
    expect(promptIndexForDate('2026-10-27')).toBe(promptIndexForDate('2026-10-27'));
    const week = new Set(Array.from({ length: 7 }, (_, i) => promptIndexForDate(addDays('2026-10-27', i))));
    expect(week.size).toBeGreaterThan(3);
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
  });
});

describe('local time', () => {
  it('formats the device day and adds days across month ends', () => {
    expect(todayLocal(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('matches the server’s time-of-day buckets', () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22].map(timeOfDay)).toEqual(
      ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night'],
    );
  });
});
