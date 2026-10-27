import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAppState } from '../lib/AppState.jsx';
import { acquireSocket, getSocket } from '../lib/socket.js';
import { formatDateTime, timeAgo } from '../lib/time.js';

const REASON_LABELS = {
  harmful: 'harmful',
  unkind: 'unkind',
  spam: 'spam',
  'personal-info': 'personal info',
  other: 'other',
};

const MUTES = [
  { hours: 0, label: 'No pause' },
  { hours: 24, label: 'Pause posting 1 day' },
  { hours: 72, label: 'Pause posting 3 days' },
  { hours: 168, label: 'Pause posting 1 week' },
];

function Item({ item, onDecide }) {
  const [mute, setMute] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function decide(action) {
    setBusy(action);
    setError('');
    try {
      await onDecide({ postId: item.postId, replyId: item.replyId ?? undefined, action, muteHours: action === 'remove' ? mute : 0, note });
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  const reasons = Object.entries(item.reasons)
    .map(([r, n]) => `${n} ${REASON_LABELS[r] ?? r}`)
    .join(', ');

  return (
    <article className={`card mod-item ${item.crisis ? 'mod-item--crisis' : item.status === 'held' ? 'mod-item--held' : ''}`}>
      <div className="mod-item__badges">
        {item.crisis && <span className="badge">May be in crisis: writer was shown helplines</span>}
        {item.status === 'held' && <span className="badge badge--warn">Held: not visible yet</span>}
        {item.hidden && <span className="badge badge--danger">Hidden by reports</span>}
        {item.reportCount > 0 && (
          <span className="badge badge--plain">
            {item.reportCount} report{item.reportCount === 1 ? '' : 's'}: {reasons}
          </span>
        )}
        {item.flags.map((f) => (
          <span key={f.id} className="badge badge--plain">
            {f.label}
          </span>
        ))}
      </div>
      <div className="post__meta">
        <span className="post__handle">{item.handle}</span>
        <span>{item.kind === 'reply' ? 'reply' : 'post'}</span>
        <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
          {timeAgo(item.createdAt)}
        </time>
      </div>
      {item.context && <p className="mod-item__context">In reply to: “{item.context}”</p>}
      <p className="mod-item__text">{item.text}</p>
      <p className="muted small">
        Writer&rsquo;s history:{' '}
        {item.author.warnings ? `${item.author.warnings} earlier removal${item.author.warnings === 1 ? '' : 's'}` : 'no earlier removals'}
        {item.author.muted ? ', posting currently paused' : ''}.
      </p>
      <div className="mod-actions">
        <button type="button" className="button button--small button--primary" disabled={Boolean(busy)} onClick={() => decide('approve')}>
          {busy === 'approve' ? 'Approving…' : item.status === 'held' || item.hidden ? 'Approve and show' : 'Keep it up'}
        </button>
        <button type="button" className="button button--small button--danger" disabled={Boolean(busy)} onClick={() => decide('remove')}>
          {busy === 'remove' ? 'Removing…' : 'Remove'}
        </button>
        <label className="sr-only" htmlFor={`mute-${item.postId}-${item.replyId}`}>
          Pause the writer’s posting
        </label>
        <select id={`mute-${item.postId}-${item.replyId}`} value={mute} onChange={(e) => setMute(Number(e.target.value))}>
          {MUTES.map((m) => (
            <option key={m.hours} value={m.hours}>
              {m.label}
            </option>
          ))}
        </select>
        <input value={note} maxLength={300} placeholder="Note for the log (optional)" aria-label="Note for the log" onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </article>
  );
}

export default function Moderation() {
  const { isModerator } = useAppState();
  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState(null);
  const [log, setLog] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [q, s] = await Promise.all([api('/moderation/queue'), api('/moderation/stats')]);
      setQueue(q);
      setStats(s.lastSevenDays);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      setLog((await api('/moderation/log')).actions);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!isModerator) return undefined;
    load();
    const socket = getSocket();
    const onChange = () => load();
    socket.on('moderation:changed', onChange);
    const release = acquireSocket();
    return () => {
      socket.off('moderation:changed', onChange);
      release();
    };
  }, [isModerator, load]);

  useEffect(() => {
    if (tab === 'log' && isModerator) loadLog();
  }, [tab, isModerator, loadLog]);

  if (!isModerator) return <Navigate to="/community" replace />;

  async function decide(body) {
    await api('/moderation/decision', { method: 'POST', body });
    setQueue((q) => ({
      ...q,
      items: q.items.filter((i) => !(i.postId === body.postId && (i.replyId ?? undefined) === body.replyId)),
    }));
    load();
  }

  const counts = queue?.counts;

  return (
    <div className="page">
      <h1 className="page-title">Moderation</h1>
      <p className="lede">People who may be in danger come first. You see what was written and the writer&rsquo;s history, never who they are.</p>

      {counts && (
        <div className="mod-counts">
          <div className="stat">
            <span className="stat__value">{counts.total}</span>
            <span className="stat__label">to review</span>
          </div>
          <div className="stat">
            <span className="stat__value">{counts.crisis}</span>
            <span className="stat__label">may be in crisis</span>
          </div>
          <div className="stat">
            <span className="stat__value">{counts.held}</span>
            <span className="stat__label">held by the filter</span>
          </div>
          <div className="stat">
            <span className="stat__value">{counts.reported}</span>
            <span className="stat__label">reported</span>
          </div>
        </div>
      )}
      {stats && (
        <p className="muted small">
          Last 7 days: {stats.reports} report{stats.reports === 1 ? '' : 's'}, {stats.approved} approved, {stats.removed} removed.
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="Moderation">
        <button type="button" role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>
          Queue
        </button>
        <button type="button" role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>
          Decision log
        </button>
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}{' '}
          <button type="button" className="link-button" onClick={load}>
            Try again
          </button>
        </p>
      )}

      {tab === 'queue' && (
        <>
          {!queue && !error && <p className="muted">Loading the queue…</p>}
          {queue && queue.items.length === 0 && <p className="empty">Nothing to review. The queue updates live when something comes in.</p>}
          {queue?.items.map((item) => (
            <Item key={`${item.postId}:${item.replyId}`} item={item} onDecide={decide} />
          ))}
        </>
      )}

      {tab === 'log' && (
        <section className="card">
          {!log && <p className="muted">Loading…</p>}
          {log && log.length === 0 && <p className="muted">No decisions yet.</p>}
          {log && log.length > 0 && (
            <ul className="log">
              {log.map((a) => (
                <li key={a.id}>
                  <div className="post__meta">
                    <span className={`badge ${a.action === 'remove' ? 'badge--danger' : ''}`} style={{ marginLeft: 0 }}>
                      {a.action === 'remove' ? 'Removed' : 'Approved'}
                    </span>
                    {a.muteHours > 0 && <span className="badge badge--plain">Paused {a.muteHours} h</span>}
                    <time dateTime={a.createdAt}>{formatDateTime(a.createdAt)}</time>
                  </div>
                  <p className="post__text">“{a.excerpt}”</p>
                  <p className="muted small">
                    By {a.moderator}
                    {a.note ? `: ${a.note}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
