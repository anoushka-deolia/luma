import { Reaction } from '../models/Reaction.js';

// Turns stored posts into what clients see. Author ids never leave the server;
// `mine` and `myReactions` are only computed for the person asking, and
// broadcasts (viewer === undefined) carry neither.

const key = (postId, replyId) => `${postId}:${replyId ?? ''}`;

export async function myReactionsFor(viewerId, postIds) {
  if (!viewerId || !postIds.length) return new Map();
  const rows = await Reaction.find({ user: viewerId, post: { $in: postIds } }).select('post reply type');
  const map = new Map();
  for (const r of rows) {
    const k = key(r.post, r.reply);
    map.set(k, [...(map.get(k) || []), r.type]);
  }
  return map;
}

const isPublic = (item) => item.status === 'visible' && !item.hidden;

export function replyJson(reply, post, viewer, reactions) {
  const own = Boolean(viewer && reply.author.equals(viewer));
  const removed = reply.status === 'removed' || (reply.hidden && !own);
  const parent = reply.parent ? post.replies.id(reply.parent) : null;
  const blank = reply.deletedByAuthor || removed;
  return {
    id: reply._id.toString(),
    parentId: reply.parent ? reply.parent.toString() : null,
    parentHandle: parent?.handle ?? null,
    depth: reply.depth ?? 1,
    handle: blank ? null : reply.handle,
    text: blank ? null : reply.text,
    deleted: Boolean(reply.deletedByAuthor),
    removed,
    held: reply.status === 'held',
    createdAt: reply.createdAt,
    isOriginalPoster: !blank && reply.author.equals(post.author),
    reactions: { ...reply.reactions },
    ...(viewer !== undefined
      ? { mine: own, myReactions: reactions?.get(key(post._id, reply._id)) ?? [] }
      : {}),
  };
}

/**
 * Which replies a viewer sees: public ones, their own held ones, and
 * placeholders for removed or deleted replies that still have visible answers
 * under them (so a thread never loses its middle).
 */
export function visibleReplies(post, viewer) {
  const canSee = (r) => isPublic(r) || (viewer && r.author.equals(viewer) && r.status === 'held');
  const shown = new Set(post.replies.filter((r) => canSee(r) && !r.deletedByAuthor).map((r) => r._id.toString()));
  // Walk up from every shown reply and keep its ancestors as placeholders.
  for (const r of post.replies) {
    if (!shown.has(r._id.toString())) continue;
    let parentId = r.parent?.toString();
    while (parentId && !shown.has(parentId)) {
      shown.add(parentId);
      parentId = post.replies.id(parentId)?.parent?.toString();
    }
  }
  return post.replies.filter((r) => shown.has(r._id.toString()));
}

export function postJson(post, viewer, reactions) {
  return {
    id: post._id.toString(),
    handle: post.handle,
    text: post.text,
    createdAt: post.createdAt,
    held: post.status === 'held',
    reactions: { ...post.reactions },
    replies: visibleReplies(post, viewer).map((r) => replyJson(r, post, viewer, reactions)),
    ...(viewer !== undefined
      ? { mine: Boolean(viewer && post.author.equals(viewer)), myReactions: reactions?.get(key(post._id)) ?? [] }
      : {}),
  };
}

export { isPublic };
