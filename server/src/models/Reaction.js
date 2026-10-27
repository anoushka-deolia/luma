import mongoose from 'mongoose';
import { REACTIONS } from './Post.js';

const reactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    reply: { type: mongoose.Schema.Types.ObjectId, default: null },
    type: { type: String, enum: REACTIONS, required: true },
  },
  { timestamps: true },
);

// Each person can give each reaction once per post or reply; tapping again takes it back.
reactionSchema.index({ user: 1, post: 1, reply: 1, type: 1 }, { unique: true });
reactionSchema.index({ post: 1 });

export const Reaction = mongoose.model('Reaction', reactionSchema);
