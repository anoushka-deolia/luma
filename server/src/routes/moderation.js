import { Router } from 'express';
import { z } from 'zod';
import { Post } from '../models/Post.js';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { ModerationAction } from '../models/ModerationAction.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { forbidden, notFound } from '../lib/errors.js';
import { FLAG_LABELS } from '../lib/moderation.js';
import { postJson, replyJson } from '../lib/feed.js';
import { broadcast } from '../realtime.js';

const router = Router();

async function requireModerator(req, _res, next) {
  const user = await User.findById(req.userId).select('role');
  if (user?.role !== 'moderator') return next(forbidden('Only moderators can see this.', 'NOT_MODERATOR'));
  return next();
}

router.use(requireAuth, requireModerator);

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const decisionBody = z.object({
  postId: objectId,
  replyId: objectId.optional(),
  action: z.enum(['approve', 'remove']),
  muteHours: z.union([z.literal(0), z.literal(24), z.literal(72), z.literal(168)]).default(0),
  note: z.string().trim().max(300).default(''),
});

const excerpt = (text) => (text.length > 140 ? `${text.slice(0, 137)}…` : text);

// Priority: someone who may be in danger first, then content that is hidden
// or held from everyone, then by how many people reported it, oldest first.
function priority(item) {
  return (item.crisis ? 1000 : 0) + (item.status === 'held' || item.hidden ? 100 : 0) + item.reportCount;
}

router.get('/queue', async (_req, res) => {
  const posts = await Post.find({ $or: [{ needsReview: true }, { 'replies.needsReview': true }] });
  const reportRows = await Report.aggregate([
    { $match: { status: 'open', post: { $in: posts.map((p) => p._id) } } },
    { $group: { _id: { post: '$post', reply: '$reply', reason: '$reason' }, n: { $sum: 1 } } },
  ]);
  const reasons = new Map();
  for (const { _id, n } of reportRows) {
    const k = `${_id.post}:${_id.reply ?? ''}`;
    reasons.set(k, { ...(reasons.get(k) || {}), [_id.reason]: n });
  }

  const authorIds = new Set();
  const items = [];
  for (const post of posts) {
    const add = (target, reply) => {
      const k = `${post._id}:${reply ? target._id : ''}`;
      const byReason = reasons.get(k) || {};
      authorIds.add(target.author.toString());
      items.push({
        postId: post._id.toString(),
        replyId: reply ? target._id.toString() : null,
        kind: reply ? 'reply' : 'post',
        handle: target.handle,
        text: target.text,
        context: reply ? excerpt(post.text) : null,
        createdAt: target.createdAt,
        status: target.status,
        hidden: target.hidden,
        crisis: target.crisis,
        flags: (target.flags || []).map((f) => ({ id: f, label: FLAG_LABELS[f] ?? f })),
        reportCount: Object.values(byReason).reduce((a, b) => a + b, 0),
        reasons: byReason,
        authorRef: target.author.toString(), // resolved to stats below, then dropped
      });
    };
    if (post.needsReview) add(post, false);
    for (const reply of post.replies) if (reply.needsReview) add(reply, true);
  }

  // Moderators see an author's history, never who they are.
  const authors = await User.find({ _id: { $in: [...authorIds] } }).select('warnings mutedUntil');
  const history = new Map(authors.map((a) => [a._id.toString(), { warnings: a.warnings, muted: a.isMuted() }]));
  for (const item of items) {
    item.author = history.get(item.authorRef) ?? { warnings: 0, muted: false };
    delete item.authorRef;
  }

  items.sort((a, b) => priority(b) - priority(a) || new Date(a.createdAt) - new Date(b.createdAt));
  res.json({
    items,
    counts: {
      total: items.length,
      crisis: items.filter((i) => i.crisis).length,
      held: items.filter((i) => i.status === 'held').length,
      reported: items.filter((i) => i.reportCount > 0).length,
    },
  });
});

router.post('/decision', validate(decisionBody), async (req, res) => {
  const { postId, replyId, action, muteHours, note } = req.body;
  const post = await Post.findById(postId);
  if (!post) throw notFound('That post no longer exists.');
  const target = replyId ? post.replies.id(replyId) : post;
  if (!target) throw notFound('That reply no longer exists.');
  const wasPublic = target.status === 'visible' && !target.hidden;

  const fields =
    action === 'approve'
      ? { status: 'visible', hidden: false, needsReview: false, reviewedAt: new Date(), flags: [] }
      : { status: 'removed', needsReview: false, reviewedAt: new Date() };
  if (replyId) {
    await Post.updateOne(
      { _id: postId, 'replies._id': replyId },
      { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`replies.$.${k}`, v])) },
    );
  } else {
    await Post.updateOne({ _id: postId }, { $set: fields });
  }

  await Report.updateMany({ post: postId, reply: replyId ?? null, status: 'open' }, { $set: { status: 'resolved' } });

  if (action === 'remove') {
    const update = { $inc: { warnings: 1 } };
    if (muteHours) update.$set = { mutedUntil: new Date(Date.now() + muteHours * 3_600_000) };
    await User.updateOne({ _id: target.author }, update);
  }

  await ModerationAction.create({
    moderator: req.userId,
    post: postId,
    reply: replyId ?? null,
    action,
    muteHours: action === 'remove' ? muteHours : 0,
    note,
    excerpt: excerpt(target.text),
  });

  // Tell everyone viewing the feed what changed.
  const fresh = await Post.findById(postId);
  if (action === 'approve' && !wasPublic) {
    if (replyId) broadcast(req.app, 'reply:new', { postId, reply: replyJson(fresh.replies.id(replyId), fresh) });
    else broadcast(req.app, 'post:new', postJson(fresh));
  }
  if (action === 'remove') {
    if (replyId) broadcast(req.app, 'reply:remove', { postId, replyId });
    else broadcast(req.app, 'post:remove', { postId });
  }
  broadcast(req.app, 'moderation:changed', {}, 'moderators');
  res.json({ ok: true });
});

router.get('/log', async (_req, res) => {
  const actions = await ModerationAction.find().sort({ createdAt: -1 }).limit(50).populate('moderator', 'email');
  res.json({
    actions: actions.map((a) => ({
      id: a._id.toString(),
      action: a.action,
      muteHours: a.muteHours,
      note: a.note,
      excerpt: a.excerpt,
      moderator: a.moderator?.email ?? 'former moderator',
      createdAt: a.createdAt,
    })),
  });
});

router.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 3_600_000);
  const [decisions, reports] = await Promise.all([
    ModerationAction.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$action', n: { $sum: 1 } } },
    ]),
    Report.countDocuments({ createdAt: { $gte: since } }),
  ]);
  const byAction = Object.fromEntries(decisions.map((d) => [d._id, d.n]));
  res.json({ lastSevenDays: { reports, approved: byAction.approve ?? 0, removed: byAction.remove ?? 0 } });
});

export default router;
