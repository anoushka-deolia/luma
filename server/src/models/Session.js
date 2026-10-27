import mongoose from 'mongoose';
import { TECHNIQUES } from '../lib/techniques.js';
import { TIME_BUCKETS } from '../lib/localTime.js';

const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    technique: { type: String, enum: TECHNIQUES, required: true },
    before: { type: Number, min: 1, max: 5, required: true },
    after: { type: Number, min: 1, max: 5, required: true },
    // Generated on the device. Ratings saved offline are retried, and this id
    // makes a retry of an already-saved rating a no-op instead of a duplicate.
    clientId: { type: String, required: true },
    occurredAt: { type: Date, required: true },
    // The person's own calendar day and time of day, sent by the app.
    localDate: { type: String },
    localHour: { type: Number, min: 0, max: 23 },
    timeOfDay: { type: String, enum: TIME_BUCKETS },
  },
  { timestamps: true },
);

sessionSchema.index({ user: 1, clientId: 1 }, { unique: true });
sessionSchema.index({ user: 1, localDate: 1 });
sessionSchema.virtual('improvement').get(function improvement() {
  return this.before - this.after;
});

export const Session = mongoose.model('Session', sessionSchema);
