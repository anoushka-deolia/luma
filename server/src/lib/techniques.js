// The four techniques in the MVP, and the onboarding answers that shape each
// user's starting score for them. Scores are in "improvement units": the drop in
// distress (1-5 scale) a technique is expected to give in one session.

export const TECHNIQUES = ['pacer', 'grounding-54321', 'pmr', 'mental-grounding'];

export const ONBOARDING_OPTIONS = {
  feelings: ['racing-thoughts', 'body-sensations', 'numb-detached'],
  helped: ['breathing', 'noticing-surroundings', 'moving-body', 'distraction'],
  worse: ['focusing-on-breath', 'focusing-on-body', 'thinking-tasks', 'sensory-attention'],
  preferences: ['visual', 'audio', 'movement', 'touch'],
};

// k: how many sessions the onboarding guess is "worth". With k = 3, three real
// sessions carry as much weight as the guess, so it fades quickly.
export const PRIOR_WEIGHT = 3;

const BASE_PRIOR = 1;

const EFFECTS = {
  feelings: {
    'racing-thoughts': { 'mental-grounding': 0.3, pacer: 0.2 },
    'body-sensations': { pmr: 0.3, pacer: 0.2 },
    'numb-detached': { 'grounding-54321': 0.4 },
  },
  helped: {
    breathing: { pacer: 0.5 },
    'noticing-surroundings': { 'grounding-54321': 0.5 },
    'moving-body': { pmr: 0.5 },
    distraction: { 'mental-grounding': 0.5 },
  },
  worse: {
    'focusing-on-breath': { pacer: -0.8 },
    'focusing-on-body': { pmr: -0.8 },
    'thinking-tasks': { 'mental-grounding': -0.8 },
    'sensory-attention': { 'grounding-54321': -0.8 },
  },
  preferences: {
    visual: { pacer: 0.2, 'grounding-54321': 0.1 },
    movement: { pmr: 0.2 },
    touch: { pmr: 0.1, pacer: 0.1 },
    audio: {},
  },
};

const PRACTICE_STEP = 0.4; // each point of practice rating above/below 3

export function computePriors(onboarding = {}, practiceRatings = {}) {
  const priors = Object.fromEntries(TECHNIQUES.map((t) => [t, BASE_PRIOR]));
  for (const [question, effects] of Object.entries(EFFECTS)) {
    for (const answer of onboarding[question] || []) {
      for (const [technique, delta] of Object.entries(effects[answer] || {})) {
        priors[technique] += delta;
      }
    }
  }
  for (const technique of TECHNIQUES) {
    const rating = practiceRatings[technique];
    if (typeof rating === 'number') priors[technique] += (rating - 3) * PRACTICE_STEP;
  }
  return priors;
}

// How many sessions at one time of day it takes to outweigh the overall score.
export const TIME_WEIGHT = 2;

/**
 * Time-of-day ranking. A technique's overall score acts as the prior for each
 * time of day, so with no data for "night" the night ranking equals the overall
 * one, and a few night sessions are enough to shift it:
 *   timeScore = (overallScore * k_t + sum of improvements at that time) / (k_t + sessions at that time)
 */
export function rankForTime(overallRanking, timeStats = {}, k = TIME_WEIGHT) {
  return overallRanking
    .map((r, order) => {
      const { sessions = 0, sumImprovement = 0 } = timeStats[r.technique] || {};
      const score = (r.score * k + sumImprovement) / (k + sessions);
      return {
        technique: r.technique,
        score: Math.round(score * 1000) / 1000,
        sessions,
        avgImprovement: sessions ? Math.round((sumImprovement / sessions) * 100) / 100 : null,
        order,
      };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ order, ...rest }) => rest);
}

/**
 * score = (priorScore * k + sum of improvements) / (k + numberOfSessions)
 * Returns techniques sorted best-first; ties keep the default technique order.
 */
export function rankTechniques(priors, stats = {}, k = PRIOR_WEIGHT) {
  return TECHNIQUES.map((technique, order) => {
    const { sessions = 0, sumImprovement = 0 } = stats[technique] || {};
    const prior = priors[technique] ?? BASE_PRIOR;
    const score = (prior * k + sumImprovement) / (k + sessions);
    return {
      technique,
      score: Math.round(score * 1000) / 1000,
      prior: Math.round(prior * 1000) / 1000,
      sessions,
      avgImprovement: sessions ? Math.round((sumImprovement / sessions) * 100) / 100 : null,
      order,
    };
  })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ order, ...rest }) => rest);
}
