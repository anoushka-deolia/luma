import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAppState } from '../lib/AppState.jsx';
import { acquireSocket, getSocket } from '../lib/socket.js';
import { formatDateTime, timeAgo } from '../lib/time.js';
import Helplines from '../components/Helplines.jsx';

const POST_MAX = 1000;
const REPLY_MAX = 600;

export const REACTIONS = [
  { id: 'support', emoji: '💜', label: 'Sending support' },
  { id: 'same', emoji: '🤝', label: 'Me too' },
  { id: 'strength', emoji: '🌱', label: 'You’ve got this' },
  { id: 'hug', emoji: '🫂', label: 'Hug' },
];

const GUIDELINES = [
  'Be kind. Everyone here is going through something.',
  'Share what helps you, but do not give medical advice or tell anyone to stop treatment.',
  'Never share anyone’s name, contact details or location, including your own. Posts with phone numbers, emails or links wait for a moderator.',
  'No descriptions of self-harm methods. If someone is in danger, point them to the helplines above.',
  'Report anything harmful. Moderators review every report.',
];

/** A soft gradient dot made from the handle, so names are easy to follow in a thread. */
function Avatar({ handle }) {
  const hue = useMemo(() => {
    let h = 0;
    for (const ch of handle || '') h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }, [handle]);
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ '--a1': `hsl(${hue} 70% 82%)`, '--a2': `hsl(${(hue + 40) % 360} 45% 52%)` }}
    />
  );
}

function GuidelinesDialog({ onAccept, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.showModal?.();
  }, []);

  async function accept() {
    setBusy(true);
    setError('');
    try {
      const { user } = await api('/auth/guidelines', { method: 'POST' });
      onAccept(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="guidelines-title">
      <div className="sheet__head">
        <h2 id="guidelines-title">Before your first post</h2>
      </div>
      <ul className="guidelines">
        {GUIDELINES.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <p className="muted small">Your posts appear under a random name that changes in every conversation. Nobody here sees your email.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="stack-buttons">
        <button type="button" className="button button--primary" onClick={accept} disabled={busy}>
          {busy ? 'Saving…' : 'I agree'}
        </button>
        <button type="button" className="button button--quiet" onClick={onClose}>
          Not now
        </button>
      </div>
    </dialog>
  );
}

function Composer({ placeholder, max, onSend, buttonLabel, compact = false, autoFocus = false, onCancel }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSend(text);
      setText('');
    } catch (err) {
      if (err.code !== 'GUIDELINES_REQUIRED') setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`composer ${compact ? 'composer--compact' : ''}`} onSubmit={submit}>
      <textarea
        rows={compact ? 2 : 3}
        maxLength={max}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="composer__row">
        <small className="muted">{text.length > max * 0.8 ? `${text.length}/${max}` : ''}</small>
        <div className="row-buttons">
          {onCancel && (
            <button type="button" className="button button--small button--quiet" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="button button--small button--primary" disabled={busy || !text.trim()}>
            {busy ? 'Sending…' : buttonLabel}
          </button>
        </div>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </form>
  );
}

function Reactions({ item, canReact, onReact }) {
  const mine = item.myReactions ?? [];
  const shown = REACTIONS.filter((r) => canReact || item.reactions?.[r.id] > 0);
  if (!shown.length) return null;
  return (
    <div className="reactions" role="group" aria-label="Reactions">
      {shown.map((r) => {
        const count = item.reactions?.[r.id] ?? 0;
        const on = mine.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            className={`reaction ${on ? 'is-on' : ''}`}
            aria-pressed={on}
            disabled={!canReact}
            title={r.label}
            aria-label={`${r.label}${count ? `, ${count}` : ''}`}
            onClick={() => onReact(r.id)}
          >
            <span className="reaction__emoji" aria-hidden="true">
              {r.emoji}
            </span>
            {count > 0 && <span className="reaction__count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ReportButton({ postId, replyId }) {
  const [state, setState] = useState('idle'); // idle | open | sent
  const [message, setMessage] = useState('');

  async function send(reason) {
    try {
      await api('/reports', { method: 'POST', body: { postId, replyId, reason } });
      setMessage('Reported. A moderator will take a look.');
    } catch (err) {
      setMessage(err.message);
    }
    setState('sent');
  }

  if (state === 'sent') return <span className="muted small">{message}</span>;
  if (state === 'open') {
    return (
      <span className="report-menu" role="group" aria-label="Why are you reporting this?">
        {[
          ['harmful', 'Harmful'],
          ['unkind', 'Unkind'],
          ['personal-info', 'Shares personal info'],
          ['spam', 'Spam'],
        ].map(([value, label]) => (
          <button key={value} type="button" className="link-button" onClick={() => send(value)}>
            {label}
          </button>
        ))}
        <button type="button" className="link-button" onClick={() => setState('idle')}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button type="button" className="link-button" onClick={() => setState('open')}>
      Report
    </button>
  );
}

/** Replies in thread order: each reply followed by its answers, indented by depth. */
function threadOrder(replies) {
  const children = new Map();
  for (const r of replies) {
    const key = r.parentId ?? 'root';
    children.set(key, [...(children.get(key) || []), r]);
  }
  const out = [];
  const visit = (key) => {
    for (const r of children.get(key) || []) {
      out.push(r);
      visit(r.id);
    }
  };
  visit('root');
  // Replies whose parent isn't shown still appear, at the end.
  const seen = new Set(out.map((r) => r.id));
  return [...out, ...replies.filter((r) => !seen.has(r.id))];
}

function Reply({ reply, post, canWrite, requireWrite, onReplySent, onDeleteReply, onReact, replyingTo, setReplyingTo }) {
  const gone = reply.deleted || reply.removed;
  const showReplyTo = reply.parentHandle && reply.depth >= 3;
  return (
    <div className="reply" style={{ '--depth': reply.depth }}>
      {gone ? (
        <p className="post__text post__text--gone">{reply.deleted ? 'This reply was deleted.' : 'Removed by a moderator.'}</p>
      ) : (
        <>
          <div className="post__meta">
            <Avatar handle={reply.handle} />
            <span className="post__handle">{reply.handle}</span>
            {reply.isOriginalPoster && <span className="badge">Original poster</span>}
            {reply.mine && <span className="badge badge--plain">You</span>}
            {reply.held && <span className="badge badge--warn">Waiting for review</span>}
            <time dateTime={reply.createdAt} title={formatDateTime(reply.createdAt)}>
              {timeAgo(reply.createdAt)}
            </time>
          </div>
          {showReplyTo && <span className="reply__to">Replying to {reply.parentHandle}</span>}
          <p className="post__text">{reply.text}</p>
          {!reply.held && <Reactions item={reply} canReact={canWrite} onReact={(type) => onReact(post.id, type, reply.id)} />}
          <div className="post__actions">
            {canWrite && !reply.held && (
              <button
                type="button"
                className="link-button"
                onClick={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                aria-expanded={replyingTo === reply.id}
              >
                Reply
              </button>
            )}
            {reply.mine ? (
              <button type="button" className="link-button" onClick={() => onDeleteReply(post.id, reply.id)}>
                Delete
              </button>
            ) : (
              canWrite && <ReportButton postId={post.id} replyId={reply.id} />
            )}
          </div>
        </>
      )}
      {replyingTo === reply.id && (
        <Composer
          compact
          autoFocus
          placeholder={`Reply to ${reply.handle}`}
          max={REPLY_MAX}
          buttonLabel="Reply"
          onCancel={() => setReplyingTo(null)}
          onSend={async (text) => {
            requireWrite();
            await onReplySent(post.id, text, reply.id);
            setReplyingTo(null);
          }}
        />
      )}
    </div>
  );
}

function Post({ post, canWrite, requireWrite, onDelete, onDeleteReply, onReplySent, onReact }) {
  const [open, setOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const ordered = useMemo(() => threadOrder(post.replies), [post.replies]);
  const count = post.replies.filter((r) => !r.deleted && !r.removed).length;

  return (
    <article className={`post ${post.held ? 'post--held' : ''}`}>
      <header className="post__meta">
        <Avatar handle={post.handle} />
        <span className="post__handle">{post.handle}</span>
        {post.mine && <span className="badge badge--plain">You</span>}
        {post.held && <span className="badge badge--warn">Waiting for review: only you can see this</span>}
        <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>
          {timeAgo(post.createdAt)}
        </time>
      </header>
      <p className="post__text">{post.text}</p>
      {!post.held && <Reactions item={post} canReact={canWrite} onReact={(type) => onReact(post.id, type)} />}
      <div className="post__actions">
        {!post.held && (
          <button type="button" className="link-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {count ? `${count} repl${count === 1 ? 'y' : 'ies'}` : canWrite ? 'Reply' : 'No replies yet'}
          </button>
        )}
        {post.mine ? (
          <button type="button" className="link-button" onClick={() => onDelete(post.id)}>
            Delete
          </button>
        ) : (
          canWrite && <ReportButton postId={post.id} />
        )}
      </div>
      {open && (
        <div className="thread">
          {ordered.map((r) => (
            <Reply
              key={r.id}
              reply={r}
              post={post}
              canWrite={canWrite}
              requireWrite={requireWrite}
              onReplySent={onReplySent}
              onDeleteReply={onDeleteReply}
              onReact={onReact}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
            />
          ))}
          {canWrite ? (
            <Composer
              compact
              placeholder="Write a kind reply"
              max={REPLY_MAX}
              buttonLabel="Reply"
              onSend={async (text) => {
                requireWrite();
                await onReplySent(post.id, text, null);
              }}
            />
          ) : (
            <p className="muted small">
              <Link to="/login" state={{ from: '/community' }}>
                Log in
              </Link>{' '}
              to reply and react.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

const upsertReply = (replies, reply) =>
  replies.some((r) => r.id === reply.id) ? replies.map((r) => (r.id === reply.id ? { ...r, ...reply } : r)) : [...replies, reply];

export default function Community() {
  const { isLoggedIn, isModerator, user, updateUser } = useAppState();
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [askGuidelines, setAskGuidelines] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'crisis' | 'held', text }

  const muted = user?.mutedUntil && new Date(user.mutedUntil) > new Date();

  const load = useCallback(async (before) => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/posts${before ? `?before=${before}` : ''}`);
      setPosts((prev) => (before ? [...prev, ...res.posts.filter((p) => !prev.some((q) => q.id === p.id))] : res.posts));
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, isLoggedIn]);

  // Live updates. On reconnect, reload the newest posts to catch anything missed.
  useEffect(() => {
    const socket = getSocket();
    let everConnected = socket.connected;
    if (socket.connected) setConnection('live');
    const onConnect = () => {
      setConnection('live');
      if (everConnected) load();
      everConnected = true;
    };
    const onDisconnect = () => setConnection('reconnecting');
    const onNewPost = (post) =>
      setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [{ ...post, mine: false, myReactions: [] }, ...prev]));
    const onNewReply = ({ postId, reply }) =>
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId && !p.replies.some((r) => r.id === reply.id)
            ? { ...p, replies: [...p.replies, { ...reply, mine: false, myReactions: [] }] }
            : p,
        ),
      );
    const onUpdateReply = ({ postId, reply }) =>
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, replies: upsertReply(p.replies, reply) } : p)));
    const onRemovePost = ({ postId }) => setPosts((prev) => prev.filter((p) => p.id !== postId));
    const onRemoveReply = ({ postId, replyId }) =>
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, replies: p.replies.filter((r) => r.id !== replyId) } : p)),
      );
    const onReaction = ({ postId, replyId, reactions }) =>
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          if (!replyId) return { ...p, reactions };
          return { ...p, replies: p.replies.map((r) => (r.id === replyId ? { ...r, reactions } : r)) };
        }),
      );

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onDisconnect);
    socket.on('post:new', onNewPost);
    socket.on('reply:new', onNewReply);
    socket.on('reply:update', onUpdateReply);
    socket.on('post:remove', onRemovePost);
    socket.on('reply:remove', onRemoveReply);
    socket.on('reaction:update', onReaction);
    const release = acquireSocket();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onDisconnect);
      socket.off('post:new', onNewPost);
      socket.off('reply:new', onNewReply);
      socket.off('reply:update', onUpdateReply);
      socket.off('post:remove', onRemovePost);
      socket.off('reply:remove', onRemoveReply);
      socket.off('reaction:update', onReaction);
      release();
    };
  }, [load]);

  function requireWrite() {
    if (!user?.guidelinesAccepted) {
      setAskGuidelines(true);
      const err = new Error('Please accept the guidelines first.');
      err.code = 'GUIDELINES_REQUIRED';
      throw err;
    }
  }

  function afterSend(res) {
    if (res.crisisSupport) {
      setNotice({
        kind: 'crisis',
        text: 'It sounds like things are really hard right now. You deserve support from a person who can help tonight.',
      });
    } else if (res.held) {
      setNotice({ kind: 'held', text: res.message });
    } else {
      setNotice(null);
    }
  }

  async function sendPost(text) {
    requireWrite();
    const res = await api('/posts', { method: 'POST', body: { text } });
    setPosts((prev) => [res.post, ...prev.filter((p) => p.id !== res.post.id)]);
    afterSend(res);
  }

  async function sendReply(postId, text, parentId) {
    const res = await api(`/posts/${postId}/replies`, { method: 'POST', body: { text, parentId: parentId ?? undefined } });
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, replies: upsertReply(p.replies, res.reply) } : p)));
    afterSend(res);
  }

  async function react(postId, type, replyId) {
    try {
      const res = await api(`/posts/${postId}/reactions`, { method: 'POST', body: { type, replyId } });
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          if (!replyId) return { ...p, reactions: res.reactions, myReactions: res.myReactions };
          return {
            ...p,
            replies: p.replies.map((r) => (r.id === replyId ? { ...r, reactions: res.reactions, myReactions: res.myReactions } : r)),
          };
        }),
      );
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
    }
  }

  async function deletePost(id) {
    if (!window.confirm('Delete your post and its replies?')) return;
    try {
      await api(`/posts/${id}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
    }
  }

  async function deleteReply(postId, replyId) {
    if (!window.confirm('Delete your reply?')) return;
    try {
      await api(`/posts/${postId}/replies/${replyId}`, { method: 'DELETE' });
      // The server either removes it or (if it has answers) blanks it; the live event updates the thread.
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const hasAnswers = p.replies.some((r) => r.parentId === replyId);
          return {
            ...p,
            replies: hasAnswers
              ? p.replies.map((r) => (r.id === replyId ? { ...r, deleted: true, text: null, handle: null } : r))
              : p.replies.filter((r) => r.id !== replyId),
          };
        }),
      );
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
    }
  }

  return (
    <div className="page">
      <Helplines />
      <div className="page-head">
        <h1 className="page-title">Community</h1>
        <span className={`live live--${connection}`} aria-live="polite">
          {connection === 'live' ? 'Live' : connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </span>
      </div>
      <p className="lede">Say you&rsquo;re struggling and get kind replies from people who understand. Everyone appears under a random name.</p>

      {isModerator && (
        <p>
          <Link to="/moderation" className="button button--small button--quiet">
            Open the review queue
          </Link>
        </p>
      )}

      {notice?.kind === 'crisis' && (
        <aside className="helplines helplines--urgent" role="alert">
          <p className="helplines__lead">{notice.text}</p>
          <p className="helplines__numbers">
            Call <a href="tel:14416">Tele-MANAS 14416</a> (free, any time) or <a href="tel:112">112</a> if you are in danger.
          </p>
          <p className="helplines__note">
            Your post is up, and people here can reply. A moderator has been told so they can keep an eye out too.{' '}
            <Link to="/">Breathe with Luma</Link> while you wait.
          </p>
        </aside>
      )}
      {notice?.kind === 'held' && (
        <p className="notice notice--warn" role="status">
          {notice.text}
        </p>
      )}
      {notice?.kind === 'error' && (
        <p className="error-text" role="alert">
          {notice.text}
        </p>
      )}

      {isLoggedIn && muted && (
        <p className="notice notice--warn">
          A moderator has paused your posting until {formatDateTime(user.mutedUntil)}. You can still read and react.
        </p>
      )}
      {isLoggedIn && !muted && <Composer placeholder="How are you doing?" max={POST_MAX} buttonLabel="Post" onSend={sendPost} />}
      {!isLoggedIn && (
        <p className="notice">
          <Link to="/login" state={{ from: '/community' }}>
            Log in
          </Link>{' '}
          or <Link to="/signup">create a profile</Link> to post, reply and react. You can read without one.
        </p>
      )}

      {error && (
        <p className="error-text" role="alert">
          {error}{' '}
          <button type="button" className="link-button" onClick={() => load()}>
            Try again
          </button>
        </p>
      )}
      {!loading && !error && posts.length === 0 && (
        <p className="empty">No posts yet. If you are having a hard time, you can be the first to say so.</p>
      )}

      <div className="feed">
        {posts.map((p) => (
          <Post
            key={p.id}
            post={p}
            canWrite={isLoggedIn && !muted}
            requireWrite={requireWrite}
            onDelete={deletePost}
            onDeleteReply={deleteReply}
            onReplySent={sendReply}
            onReact={react}
          />
        ))}
      </div>
      {loading && <p className="muted">Loading posts…</p>}
      {hasMore && !loading && (
        <button type="button" className="button button--quiet" onClick={() => load(posts.at(-1).id)}>
          Show older posts
        </button>
      )}

      {askGuidelines && (
        <GuidelinesDialog
          onAccept={(fresh) => {
            updateUser(fresh);
            setAskGuidelines(false);
          }}
          onClose={() => setAskGuidelines(false)}
        />
      )}
    </div>
  );
}
