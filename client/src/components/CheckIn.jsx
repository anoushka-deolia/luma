import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { todayLocal } from '../lib/time.js';

export const MOODS = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Really good' },
];

export const TAGS = [
  { id: 'poor-sleep', label: 'Poor sleep' },
  { id: 'rested', label: 'Rested' },
  { id: 'work-or-study', label: 'Work or study' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'health', label: 'Health' },
  { id: 'money', label: 'Money' },
  { id: 'lonely', label: 'Lonely' },
  { id: 'connected', label: 'Connected' },
  { id: 'hopeful', label: 'Hopeful' },
  { id: 'overwhelmed', label: 'Overwhelmed' },
];

export const moodLabel = (n) => MOODS.find((m) => m.value === n)?.label ?? '';
export const tagLabel = (id) => TAGS.find((t) => t.id === id)?.label ?? id;

// Moon phases: a thin crescent for a hard day, a full moon for a good one.
const PHASES = [26, 19, 12, 6, 0];

/** The moon fills as mood rises, so the scale reads without words. */
function MoodOrb({ value }) {
  const phase = PHASES[value - 1] ?? 12;
  return <span className="mood__orb" style={{ '--phase': phase, '--lit': (value - 1) / 4 }} />;
}

/**
 * The daily check-in, in a sheet: how are you overall, and (optionally) what
 * is affecting it. Saving again the same day updates it.
 */
export default function CheckInSheet({ open, initial, onClose, onSaved }) {
  const ref = useRef(null);
  const [mood, setMood] = useState(initial?.mood ?? null);
  const [tags, setTags] = useState(initial?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setMood(initial?.mood ?? null);
      setTags(initial?.tags ?? []);
      setError('');
      dialog.showModal?.();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initial]);

  const toggle = (id) => setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const { checkIn } = await api('/checkins', { method: 'PUT', body: { localDate: todayLocal(), mood, tags } });
      onSaved?.(checkIn);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="checkin-title">
      <div className="sheet__head">
        <h2 id="checkin-title">How are you today?</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="muted">One tap is enough. There are no wrong answers.</p>
      <div className="moods" role="radiogroup" aria-label="Your mood today">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mood === m.value}
            className={`mood ${mood === m.value ? 'is-on' : ''}`}
            onClick={() => setMood(m.value)}
          >
            <MoodOrb value={m.value} />
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted small">Anything playing a part? (optional)</p>
      <div className="chip-row" role="group" aria-label="What is affecting your mood">
        {TAGS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chip chip--small ${tags.includes(t.id) ? 'is-on' : ''}`}
            aria-pressed={tags.includes(t.id)}
            onClick={() => toggle(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="stack-buttons">
        <button type="button" className="button button--primary" disabled={!mood || busy} onClick={save}>
          {busy ? 'Saving…' : initial ? 'Update check-in' : 'Save check-in'}
        </button>
      </div>
    </dialog>
  );
}
