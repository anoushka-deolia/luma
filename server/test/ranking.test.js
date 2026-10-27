import { describe, expect, it } from 'vitest';
import { computePriors, rankTechniques, TECHNIQUES } from '../src/lib/techniques.js';

describe('computePriors', () => {
  it('starts every technique equal with no answers', () => {
    const priors = computePriors();
    expect(new Set(Object.values(priors))).toEqual(new Set([1]));
    expect(Object.keys(priors)).toEqual(TECHNIQUES);
  });

  it('lowers the pacer when focusing on the breath makes things worse', () => {
    const priors = computePriors({ worse: ['focusing-on-breath'] });
    expect(priors.pacer).toBeLessThan(priors.pmr);
    expect(rankTechniques(priors).at(-1).technique).toBe('pacer');
  });

  it('adds practice ratings around a neutral 3', () => {
    const priors = computePriors({}, { pmr: 5, 'mental-grounding': 1 });
    expect(priors.pmr).toBeCloseTo(1.8);
    expect(priors['mental-grounding']).toBeCloseTo(0.2);
    expect(priors.pacer).toBe(1);
  });
});

describe('rankTechniques', () => {
  it('uses (prior * k + sum) / (k + n)', () => {
    const [top] = rankTechniques({ pacer: 1, 'grounding-54321': 1, pmr: 1, 'mental-grounding': 1 }, {
      pmr: { sessions: 2, sumImprovement: 6 },
    });
    expect(top.technique).toBe('pmr');
    expect(top.score).toBeCloseTo((1 * 3 + 6) / (3 + 2));
  });

  it('lets a few real sessions outweigh the onboarding guess', () => {
    const priors = computePriors({ helped: ['breathing'] }); // pacer starts ahead
    expect(rankTechniques(priors)[0].technique).toBe('pacer');
    const ranking = rankTechniques(priors, {
      pacer: { sessions: 3, sumImprovement: 0 },
      'grounding-54321': { sessions: 3, sumImprovement: 6 },
    });
    expect(ranking[0].technique).toBe('grounding-54321');
  });

  it('keeps the default order on ties', () => {
    expect(rankTechniques(computePriors()).map((r) => r.technique)).toEqual(TECHNIQUES);
  });
});
