import mongoose from 'mongoose';

export const POST_MAX = 1000;
export const REPLY_MAX = 600;
export const MAX_REPLIES = 200;
export const MAX_DEPTH = 3; // a reply to a reply to a reply, then threads stop nesting
export const AUTO_HIDE_REPORTS = 3;
export const AUTO_HIDE_REPORTS_FLAGGED = 2; // content the filter already flagged hides sooner

export const REACTIONS = ['support', 'same', 'strength', 'hug'];
const reactionCounts = () => Object.fromEntries(REACTIONS.map((r) => [r, 0]));

// visible: shown to everyone · held: waiting for a moderator (only the author
// sees it) · removed: taken down by a moderator.
export const STATUSES = ['visible', 'held', 'removed'];

const moderationFields = {
  status: { type: String, enum: STATUSES, default: 'visible' },
  hidden: { type: Boolean, default: false }, // hidden by community reports, pending review
  reportCount: { type: Number, default: 0 },
  flags: [{ type: String }], // from the automatic filter: abuse, contact-info, link, spam, method
  crisis: { type: Boolean, default: false }, // the writer may be in danger
  needsReview: { type: Boolean, default: false },
  reviewedAt: { type: Date, default: null },
};

const replySchema = new mongoose.Schema(
  {
    // Stored so rules (rate limits, one report per person, deleting your own
    // reply) can be enforced. Never sent to other users.
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    handle: { type: String, required: true },
    text: { type: String, required: true, maxlength: REPLY_MAX },
    parent: { type: mongoose.Schema.Types.ObjectId, default: null }, // another reply in this post
    depth: { type: Number, default: 1, min: 1, max: MAX_DEPTH },
    // A reply with answers under it is blanked rather than removed, so the thread still reads.
    deletedByAuthor: { type: Boolean, default: false },
    reactions: { type: Object, default: reactionCounts },
    ...moderationFields,
  },
  { timestamps: true, minimize: false },
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    handle: { type: String, required: true },
    text: { type: String, required: true, maxlength: POST_MAX },
    replies: { type: [replySchema], default: [] },
    reactions: { type: Object, default: reactionCounts },
    ...moderationFields,
  },
  { timestamps: true, minimize: false },
);

postSchema.index({ status: 1, hidden: 1, _id: -1 });
postSchema.index({ needsReview: 1 });
postSchema.index({ 'replies.needsReview': 1 });

export const Post = mongoose.model('Post', postSchema);
