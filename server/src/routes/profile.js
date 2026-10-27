import { Router } from 'express';
import { z } from 'zod';
import { TechniqueProfile } from '../models/TechniqueProfile.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ONBOARDING_OPTIONS, TECHNIQUES } from '../lib/techniques.js';
import { profileWithRanking } from '../lib/ranking.js';
import { badRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const uniqueList = (values) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .default([])
    .transform((list) => [...new Set(list)]);

const onboardingBody = z.object({
  feelings: uniqueList(ONBOARDING_OPTIONS.feelings),
  helped: uniqueList(ONBOARDING_OPTIONS.helped),
  worse: uniqueList(ONBOARDING_OPTIONS.worse),
  preferences: uniqueList(ONBOARDING_OPTIONS.preferences),
});

const practiceBody = z.object({
  technique: z.enum(TECHNIQUES),
  rating: z.number().int().min(1).max(5),
});

router.get('/', async (req, res) => {
  res.json(await profileWithRanking(req.userId));
});

router.put('/onboarding', validate(onboardingBody), async (req, res) => {
  await TechniqueProfile.findOneAndUpdate(
    { user: req.userId },
    { $set: { onboarding: req.body } },
    { upsert: true },
  );
  res.json(await profileWithRanking(req.userId));
});

router.put('/practice', validate(practiceBody), async (req, res) => {
  const { technique, rating } = req.body;
  await TechniqueProfile.findOneAndUpdate(
    { user: req.userId },
    { $set: { [`practiceRatings.${technique}`]: rating } },
    { upsert: true },
  );
  res.json(await profileWithRanking(req.userId));
});

// Finishing onboarding is what turns on the personal go-to. At least one
// technique has to have been practised and rated first.
router.post('/complete', async (req, res) => {
  const profile = await TechniqueProfile.findOne({ user: req.userId });
  const rated = TECHNIQUES.filter((t) => typeof profile?.practiceRatings?.[t] === 'number');
  if (!rated.length) {
    throw badRequest('Try and rate at least one technique before finishing.', 'NO_PRACTICE');
  }
  profile.onboardingComplete = true;
  await profile.save();
  res.json(await profileWithRanking(req.userId));
});

export default router;
