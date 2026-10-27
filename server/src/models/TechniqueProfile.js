import mongoose from 'mongoose';
import { ONBOARDING_OPTIONS, TECHNIQUES } from '../lib/techniques.js';

const onboardingSchema = new mongoose.Schema(
  {
    feelings: [{ type: String, enum: ONBOARDING_OPTIONS.feelings }],
    helped: [{ type: String, enum: ONBOARDING_OPTIONS.helped }],
    worse: [{ type: String, enum: ONBOARDING_OPTIONS.worse }],
    preferences: [{ type: String, enum: ONBOARDING_OPTIONS.preferences }],
  },
  { _id: false },
);

const practiceSchema = new mongoose.Schema(
  Object.fromEntries(TECHNIQUES.map((t) => [t, { type: Number, min: 1, max: 5 }])),
  { _id: false },
);

const techniqueProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    onboarding: { type: onboardingSchema, default: () => ({}) },
    practiceRatings: { type: practiceSchema, default: () => ({}) },
    onboardingComplete: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const TechniqueProfile = mongoose.model('TechniqueProfile', techniqueProfileSchema);
