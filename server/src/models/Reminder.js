import mongoose from 'mongoose';

export const REMINDER_KINDS = ['checkin', 'journal', 'practice'];

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: REMINDER_KINDS, required: true },
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }, // "21:30"
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    timezone: { type: String, required: true }, // IANA, e.g. "Asia/Kolkata"
    enabled: { type: Boolean, default: true },
    lastSentDate: { type: String, default: null }, // local date of the last push
  },
  { timestamps: true },
);

reminderSchema.index({ user: 1, kind: 1 }, { unique: true });

export const Reminder = mongoose.model('Reminder', reminderSchema);
