import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import {
  createJournalKey,
  cryptoAvailable,
  decryptText,
  encryptText,
  unlockJournal,
} from '../lib/crypto.js';
import { getJournalKey, lockJournal, onJournalKeyChange, setJournalKey } from '../lib/journalKey.js';
import { addDays, formatDateTime, formatLongDate, parseDay, todayLocal } from '../lib/time.js';
import { PROMPTS, promptById, promptIndexForDate } from '../lib/prompts.js';
import { useAppState } from '../lib/AppState.jsx';

const MAX_CHARS = 20000;

async function tryDecrypt(key, entry) {
  try {
    return await decryptText(key, entry);
  } catch {
    return null;
  }
}

function SetUp({ onReady }) {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (pass.length < 8) return setError('Use at least 8 characters. A short sentence works well.');
    if (pass !== confirm) return setError('The two passphrases do not match.');
    setBusy(true);
    setError('');
    try {
      const { key, journalKey } = await createJournalKey(pass);
      await api('/journal/setup', { method: 'POST', body: journalKey });
      setJournalKey(key);
      onReady();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      <h1 className="page-title">Your private journal</h1>
      <p>
        A page a day, with a gentle prompt, plus free notes whenever you need them. Everything is locked with a
        passphrase on this device before it is saved, so only scrambled text ever reaches Luma&rsquo;s server.
      </p>
      <p className="notice notice--warn">If you forget this passphrase, your entries cannot be recovered. There is no reset.</p>
      <label className="field">
        <span>Passphrase</span>
        <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      <label className="field">
        <span>Type it again</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>I understand that a lost passphrase means lost entries.</span>
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="button button--primary" disabled={!understood || busy || !pass}>
        {busy ? 'Creating your journal…' : 'Create journal'}
      </button>
    </form>
  );
}

function Unlock({ journalKey }) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const key = await unlockJournal(pass, journalKey);
      if (!key) {
        setError("That passphrase didn't unlock your journal. Check it and try again.");
        return;
      }
      setJournalKey(key);
    } catch {
      setError('This browser could not unlock the journal. Try again, or use another browser.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      <h1 className="page-title">Your journal is locked</h1>
      <p className="muted">Enter your passphrase. It stays on this device.</p>
      <label className="field">
        <span>Passphrase</span>
        <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="button button--primary" disabled={busy || !pass}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
    </form>
  );
}

/** Today's page: one prompt, one page, rewrite as often as you like today. */
function TodayPage({ cryptoKey }) {
  const { refreshToday } = useAppState();
  const today = todayLocal();
  const [promptIndex, setPromptIndex] = useState(() => promptIndexForDate(today));
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(null); // { text, at }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const prompt = PROMPTS[promptIndex];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { page } = await api(`/journal/daily/${today}`);
        if (cancelled) return;
        if (page) {
          const plain = await tryDecrypt(cryptoKey, page);
          if (plain === null) setError('Today’s page could not be decrypted with this passphrase.');
          else {
            setText(plain);
            setSaved({ text: plain, at: page.updatedAt });
          }
          const idx = PROMPTS.findIndex((p) => p.id === page.promptId);
          if (idx >= 0) setPromptIndex(idx);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cryptoKey, today]);

  async function save(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const sealed = await encryptText(cryptoKey, trimmed);
      const { page } = await api(`/journal/daily/${today}`, {
        method: 'PUT',
        body: { ...sealed, promptId: prompt.id },
      });
      setSaved({ text: trimmed, at: page.updatedAt });
      refreshToday().catch(() => {});
    } catch (err) {
      setError(`${err.message} Your words are still in the box.`);
    } finally {
      setBusy(false);
    }
  }

  const dirty = text.trim() !== (saved?.text ?? '');

  return (
    <form className="card daily" onSubmit={save}>
      <p className="daily__date">{formatLongDate(today)}</p>
      <p className="daily__prompt" id="daily-prompt">
        {prompt.text}
      </p>
      {!saved && (
        <button
          type="button"
          className="link-button small"
          onClick={() => setPromptIndex((i) => (i + 1) % PROMPTS.length)}
        >
          Show a different prompt
        </button>
      )}
      <label className="field" style={{ marginTop: 10 }}>
        <span className="sr-only">Today’s page</span>
        <textarea
          aria-describedby="daily-prompt"
          value={text}
          maxLength={MAX_CHARS}
          disabled={loading}
          placeholder={loading ? 'Opening today’s page…' : 'Write as much or as little as you like.'}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="daily__foot">
        <span className="muted small" role="status">
          {saved ? (dirty ? 'Unsaved changes' : `Saved ${formatDateTime(saved.at)}`) : 'Encrypted on this device before saving'}
        </span>
        <button type="submit" className="button button--primary" disabled={busy || loading || !text.trim() || !dirty}>
          {busy ? 'Encrypting…' : saved ? 'Save changes' : 'Save today’s page'}
        </button>
      </div>
    </form>
  );
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** Calendar of past pages; tap a day to read it. */
function PastDays({ cryptoKey }) {
  const today = todayLocal();
  const [pages, setPages] = useState(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [selected, setSelected] = useState(null); // { date, text, prompt }

  useEffect(() => {
    api(`/journal/daily?today=${today}&days=370`)
      .then((res) => setPages(new Map(res.pages.map((p) => [p.localDate, p]))))
      .catch((err) => setError(err.message));
  }, [today]);

  const grid = useMemo(() => {
    const first = `${month}-01`;
    const startOffset = (parseDay(first).getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    return { startOffset, days: Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)) };
  }, [month]);

  async function open(date) {
    const page = pages.get(date);
    if (!page) return;
    const text = await tryDecrypt(cryptoKey, page);
    setSelected({ date, text, prompt: promptById(page.promptId)?.text });
  }

  const shift = (n) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelected(null);
  };

  if (error) return <p className="error-text">{error}</p>;
  if (!pages) return <p className="muted">Loading your pages…</p>;
  const inMonth = grid.days.filter((d) => pages.has(d)).length;

  return (
    <>
      <section className="card">
        <div className="card__head">
          <button type="button" className="icon-button" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </button>
          <h2 className="section-title" style={{ margin: 0 }}>
            {monthName.format(parseDay(`${month}-01`))}
          </h2>
          <button
            type="button"
            className="icon-button"
            onClick={() => shift(1)}
            aria-label="Next month"
            disabled={month >= today.slice(0, 7)}
          >
            ›
          </button>
        </div>
        <p className="muted small" style={{ textAlign: 'center' }}>
          {inMonth ? `${inMonth} page${inMonth === 1 ? '' : 's'} this month` : 'No pages this month yet'}
        </p>
        <div className="month">
          {DOW.map((d, i) => (
            <span key={`${d}${i}`} className="month__dow" aria-hidden="true">
              {d}
            </span>
          ))}
          {Array.from({ length: grid.startOffset }, (_, i) => (
            <span key={`pad${i}`} />
          ))}
          {grid.days.map((date) => {
            const has = pages.has(date);
            return (
              <button
                key={date}
                type="button"
                className={`month__day ${has ? 'has-page' : ''} ${date === today ? 'is-today' : ''} ${selected?.date === date ? 'is-selected' : ''}`}
                disabled={!has || date > today}
                onClick={() => open(date)}
                aria-label={`${formatLongDate(date)}${has ? ', has a page' : ''}`}
              >
                {Number(date.slice(8))}
              </button>
            );
          })}
        </div>
      </section>
      {selected && (
        <article className="entry" aria-live="polite">
          <div className="entry__meta">
            <span>{formatLongDate(selected.date)}</span>
            <button type="button" className="link-button" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          {selected.prompt && <p className="entry__prompt">{selected.prompt}</p>}
          {selected.text === null ? (
            <p className="error-text">This page could not be decrypted with this passphrase.</p>
          ) : (
            <p className="entry__text">{selected.text}</p>
          )}
        </article>
      )}
    </>
  );
}

/** Free notes, any time, as many as you like. */
function Notes({ cryptoKey }) {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(
    async (before) => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await api(`/journal/entries${before ? `?before=${before}` : ''}`);
        const decrypted = await Promise.all(res.entries.map(async (e) => ({ ...e, text: await tryDecrypt(cryptoKey, e) })));
        setEntries((prev) => (before ? [...prev, ...decrypted] : decrypted));
        setHasMore(res.hasMore);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [cryptoKey],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function save(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveError('');
    try {
      const encrypted = await encryptText(cryptoKey, trimmed);
      const { entry } = await api('/journal/entries', { method: 'POST', body: { ...encrypted, localDate: todayLocal() } });
      setEntries((prev) => [{ ...entry, text: trimmed }, ...prev]);
      setText('');
    } catch (err) {
      setSaveError(`${err.message} Your words are still in the box.`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    try {
      await api(`/journal/entries/${id}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      if (err.status === 404) setEntries((prev) => prev.filter((e) => e.id !== id));
      else window.alert(err.message);
    }
  }

  return (
    <>
      <form className="form card" onSubmit={save}>
        <label className="field">
          <span>A quick note</span>
          <textarea
            rows={4}
            value={text}
            maxLength={MAX_CHARS}
            onChange={(e) => setText(e.target.value)}
            placeholder="Anything on your mind, any time."
          />
        </label>
        {saveError && <p className="error-text" role="alert">{saveError}</p>}
        <button type="submit" className="button button--primary" disabled={saving || !text.trim()}>
          {saving ? 'Encrypting and saving…' : 'Save note'}
        </button>
      </form>
      {loadError && (
        <p className="error-text" role="alert">
          {loadError}{' '}
          <button type="button" className="link-button" onClick={() => load()}>
            Try again
          </button>
        </p>
      )}
      {!loading && !loadError && entries.length === 0 && (
        <p className="empty">No notes yet. They will appear here, readable only where you unlock your journal.</p>
      )}
      <ul className="entries">
        {entries.map((e) => (
          <li key={e.id} className="entry">
            <div className="entry__meta">
              <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
              <button type="button" className="link-button" onClick={() => remove(e.id)}>
                Delete
              </button>
            </div>
            {e.text === null ? (
              <p className="error-text">This note could not be decrypted with this passphrase.</p>
            ) : (
              <p className="entry__text">{e.text}</p>
            )}
          </li>
        ))}
      </ul>
      {loading && <p className="muted">Loading and decrypting…</p>}
      {hasMore && !loading && (
        <button type="button" className="button button--quiet" onClick={() => load(entries.at(-1).id)}>
          Show older notes
        </button>
      )}
    </>
  );
}

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'past', label: 'Past days' },
  { id: 'notes', label: 'Notes' },
];

export default function Journal() {
  const [meta, setMeta] = useState(undefined); // undefined = loading
  const [error, setError] = useState('');
  const [key, setKey] = useState(getJournalKey);
  const [tab, setTab] = useState('today');

  useEffect(() => onJournalKeyChange(setKey), []);

  const loadMeta = useCallback(async () => {
    setError('');
    try {
      const res = await api('/journal/meta');
      setMeta(res.journalKey);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  let body;
  if (!cryptoAvailable()) {
    body = <p className="error-text">This browser cannot encrypt your journal. Open Luma over HTTPS in an up-to-date browser.</p>;
  } else if (error) {
    body = (
      <p className="error-text" role="alert">
        {error}{' '}
        <button type="button" className="link-button" onClick={loadMeta}>
          Try again
        </button>
      </p>
    );
  } else if (meta === undefined) {
    body = <p className="muted">Opening your journal…</p>;
  } else if (meta === null) {
    body = <SetUp onReady={loadMeta} />;
  } else if (!key) {
    body = <Unlock journalKey={meta} />;
  } else {
    body = (
      <>
        <div className="page-head">
          <h1 className="page-title">Journal</h1>
          <button type="button" className="button button--small button--quiet" onClick={lockJournal}>
            Lock
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="Journal sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'today' && <TodayPage cryptoKey={key} />}
          {tab === 'past' && <PastDays cryptoKey={key} />}
          {tab === 'notes' && <Notes cryptoKey={key} />}
        </div>
      </>
    );
  }
  return <div className="page page--narrow">{body}</div>;
}
