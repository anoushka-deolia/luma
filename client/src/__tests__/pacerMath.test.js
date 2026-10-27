import { describe, expect, it } from 'vitest';
import { breathPhase, measurePeriod, nextPeriod, TARGET_PERIOD } from '../techniques/pacerMath.js';

describe('pacer', () => {
  it('measures the median gap between taps', () => {
    expect(measurePeriod([0, 3000, 6200, 9000])).toBeCloseTo(3);
  });

  it('ignores a double tap', () => {
    expect(measurePeriod([0, 4000, 4100, 8000])).toBeCloseTo(4);
  });

  it('needs at least two taps', () => {
    expect(measurePeriod([1000])).toBeNull();
  });

  it('slows each breath a little until the calm target, never past it', () => {
    let period = 3;
    for (let i = 0; i < 100; i += 1) period = nextPeriod(period);
    expect(period).toBe(TARGET_PERIOD);
    expect(nextPeriod(12)).toBe(12); // someone already breathing slowly keeps their pace
    expect(nextPeriod(4)).toBeCloseTo(4.2);
  });

  it('gives the exhale more time than the inhale', () => {
    expect(breathPhase(1.9, 5).phase).toBe('in');
    expect(breathPhase(2.1, 5).phase).toBe('out');
  });
});
