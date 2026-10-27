// Pure logic for the tap-along pacer, kept separate so it can be tested.

export const DEFAULT_PERIOD = 5; // seconds per breath before the person has tapped
export const TARGET_PERIOD = 10; // 6 breaths a minute, a common calm-breathing pace
export const SLOWDOWN = 1.05; // each guided breath is up to 5% longer than the last
export const MIN_PERIOD = 2;
export const MAX_PERIOD = 14;
export const TAPS_NEEDED = 4; // 4 taps = 3 full breaths measured
export const INHALE_SHARE = 0.4; // exhale longer than inhale, which is calming

/** Median of the gaps between taps, in seconds, ignoring obvious mis-taps. */
export function measurePeriod(tapTimesMs) {
  if (tapTimesMs.length < 2) return null;
  // A tap too soon after the last one is a double tap on the same breath: skip it.
  const breaths = [tapTimesMs[0]];
  for (const t of tapTimesMs.slice(1)) {
    if ((t - breaths.at(-1)) / 1000 >= MIN_PERIOD * 0.5) breaths.push(t);
  }
  const gaps = [];
  for (let i = 1; i < breaths.length; i += 1) {
    const gap = (breaths[i] - breaths[i - 1]) / 1000;
    if (gap <= MAX_PERIOD * 1.5) gaps.push(gap);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.min(MAX_PERIOD, Math.max(MIN_PERIOD, median));
}

/** The next breath's length: a little slower, never past the calm target. */
export function nextPeriod(current) {
  if (current >= TARGET_PERIOD) return current; // already calm: keep their pace
  return Math.min(TARGET_PERIOD, current * SLOWDOWN);
}

/** Where we are inside one breath: phase and how far through it (0..1). */
export function breathPhase(elapsed, period) {
  const inhale = period * INHALE_SHARE;
  if (elapsed < inhale) return { phase: 'in', progress: elapsed / inhale };
  return { phase: 'out', progress: Math.min(1, (elapsed - inhale) / (period - inhale)) };
}

export const breathsPerMinute = (period) => Math.round(60 / period);
