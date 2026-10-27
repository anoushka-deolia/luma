import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  Post,
  POST_MAX,
  REPLY_MAX,
  MAX_REPLIES,
  MAX_DEPTH,
  AUTO_HIDE_REPORTS,
  AUTO_HIDE_REPORTS_FLAGGED,
  REACTIONS,
} from '../models/Post.js';
import { Report, REPORT_REASONS } from '../models/Report.js';
import { Reaction } from '../models/Reaction.js';
import { User } from '../models/User.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { postLimiter, reactionLimiter, replyLimiter, reportLimiter } from '../middleware/rateLimits.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { threadHandle } from '../lib/handles.js';
import { analyseText, HELD_MESSAGE } from '../lib/moderation.js';
import { isPublic, myReactionsFor, postJson, replyJson } from '../lib/feed.js';
import { broadcast } from '../realtime.js';

const router = Router();

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Unknown item.');

// Collapse runs of blank lines and trim, so a post can't be a wall of whitespace.
const cleanText = (max, label) =>
  z
    .string()
    .transform((s) => s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(
      z
        .string()
        .min(1, `Please write something before sending.`)
        .max(max, `${label} can be at most ${max} characters.`),
    );

const postBody = z.object({ text: cleanText(POST_MAX, 'A post') });
const replyBody = z.object({ text: cleanText(REPLY_MAX, 'A reply'), parentId: objectId.optional() });
const reactionBody = z.object({ type: z.enum(REACTIONS), replyId: objectId.optional() });
const reportBody = z.object({
  postId: objectId,
  replyId: objectId.optional(),
  reason: z.enum(REPORT_REASONS).default('other'),
});
const feedQuery = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

async function requireCanWrite(userId) {
  const user = await User.findById(userId);
  if (!user) throw notFound('This account no longer exists.');
  if (!user.guidelinesAcceptedAt) {
    throw forbidden('Please read and accept the community guidelines first.', 'GUIDELINES_REQUIRED');
  }
  if (user.isMuted()) {
    const until = user.mutedUntil.toISOString();
    const err = forbidden('A moderator has paused your posting for a while. You can still read and react.', 'MUTED');
    err.details = { mutedUntil: until };
    throw err;
  }
  return user;
}

function moderationFieldsFor(text) {
  const { crisis, flags, hold } = analyseText(text);
  return {
    fields: { status: hold ? 'held' : 'visible', flags, crisis, needsReview: hold || crisis },
    response: {
      held: hold,
      crisisSupport: crisis,
      ...(hold ? { message: HELD_MESSAGE } : {}),
    },
  };
}

router.get('/', optionalAuth, validate(feedQuery, 'query'), async (req, res) => {
  const { before, limit } = req.validatedQuery;
  const viewer = req.userId ? new mongoose.Types.ObjectId(req.userId) : null;
  const visible = { status: 'visible', hidden: false };
  const filter = {
    ...(viewer ? { $or: [visible, { author: viewer, status: 'held' }] } : visible),
    ...(before ? { _id: { $lt: before } } : {}),
  };
  const posts = await Post.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const page = posts.slice(0, limit);
  const reactions = await myReactionsFor(viewer, page.map((p) => p._id));
  res.json({
    posts: page.map((p) => postJson(p, viewer, reactions)),
    hasMore: posts.length > limit,
  });
});

router.post('/', requireAuth, postLimiter, validate(postBody), async (req, res) => {
  await requireCanWrite(req.userId);
  const recent = await Post.exists({
    author: req.userId,
    text: req.body.text,
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  });
  if (recent) throw conflict('You just posted this. It is already in the feed.', 'DUPLICATE_POST');

  const { fields, response } = moderationFieldsFor(req.body.text);
  const _id = new mongoose.Types.ObjectId();
  const post = await Post.create({
    _id,
    author: req.userId,
    handle: threadHandle(req.userId, _id),
    text: req.body.text,
    ...fields,
  });
  if (fields.status === 'visible') broadcast(req.app, 'post:new', postJson(post));
  if (fields.needsReview) broadcast(req.app, 'moderation:changed', {}, 'moderators');
  const viewer = post.author;
  res.status(201).json({ post: postJson(post, viewer, new Map()), ...response });
});

router.post('/:id/replies', requireAuth, replyLimiter, validate(replyBody), async (req, res) => {
  await requireCanWrite(req.userId);
  const post = await Post.findOne({ _id: req.params.id, status: 'visible', hidden: false });
  if (!post) throw notFound('That post is no longer available.');
  if (post.replies.length >= MAX_REPLIES) {
    throw conflict('This conversation is full. You could start a new post instead.', 'THREAD_FULL');
  }

  let parent = null;
  let depth = 1;
  if (req.body.parentId) {
    const target = post.replies.id(req.body.parentId);
    if (!target || target.deletedByAuthor || target.status === 'removed') {
      throw notFound('That reply is no longer available.');
    }
    // Threads indent up to MAX_DEPTH levels; deeper answers keep their parent
    // link (shown as "replying to …") but stop indenting further.
    parent = target._id;
    depth = Math.min(MAX_DEPTH, (target.depth ?? 1) + 1);
  }

  const { fields, response } = moderationFieldsFor(req.body.text);
  const reply = {
    _id: new mongoose.Types.ObjectId(),
    author: new mongoose.Types.ObjectId(req.userId),
    handle: threadHandle(req.userId, post._id),
    text: req.body.text,
    parent,
    depth,
    ...fields,
  };
  // $push instead of save() so two replies arriving together can't overwrite each other.
  const updated = await Post.findOneAndUpdate(
    { _id: post._id, status: 'visible', hidden: false },
    { $push: { replies: reply } },
    { returnDocument: 'after' },
  );
  if (!updated) throw notFound('That post is no longer available.');
  const saved = updated.replies.id(reply._id);
  if (fields.status === 'visible') {
    broadcast(req.app, 'reply:new', { postId: updated._id.toString(), reply: replyJson(saved, updated) });
  }
  if (fields.needsReview) broadcast(req.app, 'moderation:changed', {}, 'moderators');
  res.status(201).json({
    postId: updated._id.toString(),
    reply: replyJson(saved, updated, reply.author, new Map()),
    ...response,
  });
});

router.post('/:id/reactions', requireAuth, reactionLimiter, validate(reactionBody), async (req, res) => {
  const { type, replyId } = req.body;
  const post = await Post.findOne({ _id: req.params.id, status: 'visible', hidden: false });
  if (!post) throw notFound('That post is no longer available.');
  const reply = replyId ? post.replies.id(replyId) : null;
  if (replyId && (!reply || !isPublic(reply) || reply.deletedByAuthor)) throw notFound('That reply is no longer available.');

  const where = { user: req.userId, post: post._id, reply: reply?._id ?? null, type };
  let delta = 1;
  try {
    await Reaction.create(where);
  } catch (err) {
    if (err?.code !== 11000) throw err;
    await Reaction.deleteOne(where); // tapped again: take the reaction back
    delta = -1;
  }

  const path = reply ? `replies.$[r].reactions.${type}` : `reactions.${type}`;
  const updated = await Post.findOneAndUpdate(
    { _id: post._id },
    { $inc: { [path]: delta } },
    { returnDocument: 'after', ...(reply ? { arrayFilters: [{ 'r._id': reply._id }] } : {}) },
  );
  const target = reply ? updated.replies.id(reply._id) : updated;
  const reactions = { ...target.reactions };
  const mine = (await Reaction.find({ user: req.userId, post: post._id, reply: reply?._id ?? null })).map((r) => r.type);
  const payload = { postId: post._id.toString(), replyId: reply?._id.toString() ?? null, reactions };
  broadcast(req.app, 'reaction:update', payload);
  res.json({ ...payload, myReactions: mine });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const post = await Post.findOneAndDelete({ _id: req.params.id, author: req.userId });
  if (!post) throw notFound('That post no longer exists, or it is not yours.');
  await Promise.all([Report.deleteMany({ post: post._id }), Reaction.deleteMany({ post: post._id })]);
  broadcast(req.app, 'post:remove', { postId: post._id.toString() });
  res.status(204).end();
});

router.delete('/:id/replies/:replyId', requireAuth, async (req, res) => {
  const post = await Post.findOne({
    _id: req.params.id,
    replies: { $elemMatch: { _id: req.params.replyId, author: req.userId } },
  });
  if (!post) throw notFound('That reply no longer exists, or it is not yours.');
  const replyId = new mongoose.Types.ObjectId(req.params.replyId);
  const hasAnswers = post.replies.some((r) => r.parent?.equals(replyId));
  if (hasAnswers) {
    // Keep the place in the thread, drop the words.
    await Post.updateOne(
      { _id: post._id, 'replies._id': replyId },
      { $set: { 'replies.$.deletedByAuthor': true, 'replies.$.text': '[deleted]' } },
    );
    const updated = await Post.findById(post._id);
    broadcast(req.app, 'reply:update', { postId: post._id.toString(), reply: replyJson(updated.replies.id(replyId), updated) });
  } else {
    await Post.updateOne({ _id: post._id }, { $pull: { replies: { _id: replyId } } });
    broadcast(req.app, 'reply:remove', { postId: post._id.toString(), replyId: replyId.toString() });
  }
  await Reaction.deleteMany({ post: post._id, reply: replyId });
  res.status(204).end();
});

export const reportsRouter = Router();

reportsRouter.post('/', requireAuth, reportLimiter, validate(reportBody), async (req, res) => {
  const { postId, replyId, reason } = req.body;
  const [post, reporter] = await Promise.all([Post.findById(postId), User.findById(req.userId)]);
  if (!post) throw notFound('That post no longer exists.');
  const target = replyId ? post.replies.id(replyId) : post;
  if (!target) throw notFound('That reply no longer exists.');
  if (target.author.equals(req.userId)) throw badRequest('You cannot report your own message.', 'OWN_CONTENT');

  try {
    await Report.create({ reporter: req.userId, post: postId, reply: replyId ?? null, reason });
  } catch (err) {
    if (err?.code === 11000) throw conflict('You have already reported this. Thank you.', 'ALREADY_REPORTED');
    throw err;
  }

  // Count distinct people with open reports (not a running counter), so the
  // threshold can't be reached by one person. Content the filter already
  // flagged hides sooner, and a moderator's report hides it straight away.
  const openReports = await Report.countDocuments({ post: postId, reply: replyId ?? null, status: 'open' });
  const threshold = target.flags?.length ? AUTO_HIDE_REPORTS_FLAGGED : AUTO_HIDE_REPORTS;
  const hidden = target.hidden || openReports >= threshold || reporter?.role === 'moderator';
  const set = { reportCount: openReports, hidden, needsReview: true };
  if (replyId) {
    await Post.updateOne(
      { _id: postId, 'replies._id': replyId },
      { $set: Object.fromEntries(Object.entries(set).map(([k, v]) => [`replies.$.${k}`, v])) },
    );
    if (hidden && !target.hidden) broadcast(req.app, 'reply:remove', { postId, replyId });
  } else {
    await Post.updateOne({ _id: postId }, { $set: set });
    if (hidden && !target.hidden) broadcast(req.app, 'post:remove', { postId });
  }
  broadcast(req.app, 'moderation:changed', {}, 'moderators');
  res.status(201).json({ ok: true, hidden });
});

export default router;
