import mongoose from 'mongoose';

export const CHECKIN_TAGS = [
  'poor-sleep',
  'rested',
  'work-or-study',
  'relationships',
  'health',
  'money',
  'lonely',
  'connected',
  'hopeful',
  'overwhelmed',
];

// One gentle check-in per person per day: how they feel overall (1 = very low,
// 5 = really good) and, optionally, what is affecting it. Updating the same day
// replaces it.
const checkInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    localDate: { type: String, required: true },
    mood: { type: Number, min: 1, max: 5, required: true },
    tags: [{ type: String, enum: CHECKIN_TAGS }],
  },
  { timestamps: true },
);

checkInSchema.index({ user: 1, localDate: 1 }, { unique: true });

export const CheckIn = mongoose.model('CheckIn', checkInSchema);
