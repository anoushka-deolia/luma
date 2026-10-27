import mongoose from 'mongoose';

// Audit log: every moderator decision is recorded, so decisions can be reviewed.
const moderationActionSchema = new mongoose.Schema(
  {
    moderator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    reply: { type: mongoose.Schema.Types.ObjectId, default: null },
    action: { type: String, enum: ['approve', 'remove'], required: true },
    muteHours: { type: Number, default: 0 },
    note: { type: String, maxlength: 300, default: '' },
    excerpt: { type: String, maxlength: 140 },
  },
  { timestamps: true },
);

moderationActionSchema.index({ createdAt: -1 });

export const ModerationAction = mongoose.model('ModerationAction', moderationActionSchema);
