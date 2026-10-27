import mongoose from 'mongoose';

export const REPORT_REASONS = ['harmful', 'unkind', 'spam', 'personal-info', 'other'];

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    reply: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, enum: REPORT_REASONS, default: 'other' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: true },
);

// One report per person per post or reply, so one person cannot hide content alone.
reportSchema.index({ reporter: 1, post: 1, reply: 1 }, { unique: true });
reportSchema.index({ post: 1, reply: 1, status: 1 });

export const Report = mongoose.model('Report', reportSchema);
