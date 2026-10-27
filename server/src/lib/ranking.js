import mongoose from 'mongoose';
import { Session } from '../models/Session.js';
import { TechniqueProfile } from '../models/TechniqueProfile.js';
import { computePriors, rankForTime, rankTechniques } from './techniques.js';
import { BUCKET_LABELS, TIME_BUCKETS } from './localTime.js';

const MIN_SESSIONS_FOR_REASON = 2;

export async function sessionStatsFor(userId) {
  const rows = await Session.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$technique',
        sessions: { $sum: 1 },
        sumImprovement: { $sum: { $subtract: ['$before', '$after'] } },
        avgBefore: { $avg: '$before' },
        avgAfter: { $avg: '$after' },
      },
    },
  ]);
  return Object.fromEntries(rows.map(({ _id, ...rest }) => [_id, rest]));
}

/** { morning: { pmr: { sessions, sumImprovement } }, ... } */
export async function timeStatsFor(userId) {
  const rows = await Session.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), timeOfDay: { $in: TIME_BUCKETS } } },
    {
      $group: {
        _id: { time: '$timeOfDay', technique: '$technique' },
        sessions: { $sum: 1 },
        sumImprovement: { $sum: { $subtract: ['$before', '$after'] } },
      },
    },
  ]);
  const out = Object.fromEntries(TIME_BUCKETS.map((b) => [b, {}]));
  for (const { _id, sessions, sumImprovement } of rows) {
    out[_id.time][_id.technique] = { sessions, sumImprovement };
  }
  return out;
}

function reasonFor(bucket, timeRanking, overallTop) {
  const top = timeRanking[0];
  if (top.sessions < MIN_SESSIONS_FOR_REASON || top.avgImprovement === null || top.avgImprovement <= 0) return null;
  return {
    technique: top.technique,
    sessions: top.sessions,
    avgImprovement: top.avgImprovement,
    differsFromOverall: top.technique !== overallTop,
    label: BUCKET_LABELS[bucket],
  };
}

/** The ranking that decides the go-to and the "Try another" order, overall and per time of day. */
export async function profileWithRanking(userId) {
  let profile = await TechniqueProfile.findOne({ user: userId });
  if (!profile) profile = await TechniqueProfile.create({ user: userId });
  const [stats, timeStats] = await Promise.all([sessionStatsFor(userId), timeStatsFor(userId)]);
  const priors = computePriors(profile.onboarding, profile.practiceRatings?.toObject?.() ?? {});
  const ranking = rankTechniques(priors, stats);
  const complete = profile.onboardingComplete;

  const byTime = {};
  for (const bucket of TIME_BUCKETS) {
    const timeRanking = rankForTime(ranking, timeStats[bucket]);
    byTime[bucket] = {
      ranking: timeRanking,
      goTo: complete ? timeRanking[0].technique : 'pacer',
      reason: complete ? reasonFor(bucket, timeRanking, ranking[0].technique) : null,
    };
  }

  return {
    onboarding: profile.onboarding,
    practiceRatings: profile.practiceRatings,
    onboardingComplete: complete,
    ranking,
    goTo: complete ? ranking[0].technique : 'pacer',
    byTime,
  };
}
