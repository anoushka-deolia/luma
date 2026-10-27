import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppState } from '../lib/AppState.jsx';
import { techniqueName } from '../lib/techniques.js';
import { THEMES, TEXT_SIZES, useSettings } from '../lib/settings.js';
import { api } from '../lib/api.js';
import { deviceTimezone } from '../lib/time.js';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push.js';
import Helplines, { Disclaimer } from '../components/Helplines.jsx';

function Toggle({ label, hint, checked, onChange }) {
  // aria-labelledby takes a list of ids separated by spaces, so the id must not
  // contain any (labels like "Low stimulation" do).
  const labelId = useId();
  return (
    <div className="setting">
      <span className="setting__text" id={labelId}>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button
        type="button"
        role="switch"
        className="toggle"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="setting" style={{ flexWrap: 'wrap' }}>
      <span className="setting__text">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`chip chip--small ${value === o.id ? 'is-on' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Appearance() {
  const [s, update] = useSettings();
  return (
    <section className="card">
      <h2 className="section-title">Appearance</h2>
      <div className="settings-group">
        <div className="themes" role="radiogroup" aria-label="Colour theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={s.theme === t.id}
              className={`theme-option ${s.theme === t.id ? 'is-on' : ''}`}
              onClick={() => update({ theme: t.id })}
            >
              <span
                className="theme-option__swatch"
                style={{ background: `radial-gradient(circle at 30% 30%, ${t.swatch[1]}, ${t.swatch[0]})`, boxShadow: `0 0 16px 2px ${t.swatch[2]}66, 0 0 0 1px ${t.swatch[2]}` }}
                aria-hidden="true"
              />
              {t.name}
            </button>
          ))}
        </div>
        <Segmented
          label="Sky"
          value={s.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { id: 'system', name: 'Match device' },
            { id: 'dark', name: 'Night' },
            { id: 'light', name: 'Dawn' },
          ]}
        />
        <Toggle
          label="Low stimulation"
          hint="Plain colours, no stars, glow or movement, fewer numbers. Good for overwhelming moments."
          checked={s.lowStim}
          onChange={(lowStim) => update({ lowStim })}
        />
      </div>
    </section>
  );
}

function Accessibility() {
  const [s, update] = useSettings();
  return (
    <section className="card">
      <h2 className="section-title">Accessibility</h2>
      <div className="settings-group">
        <Segmented label="Text size" value={s.textSize} onChange={(textSize) => update({ textSize })} options={TEXT_SIZES} />
        <Toggle label="High contrast" hint="Stronger text and borders." checked={s.contrast} onChange={(contrast) => update({ contrast })} />
        <Toggle
          label="Reduce motion"
          hint="The breathing circle glows instead of growing, and nothing else moves. Follows your device setting when off."
          checked={s.motion === 'reduce'}
          onChange={(on) => update({ motion: on ? 'reduce' : 'system' })}
        />
        <Toggle
          label="Vibrate with the breath"
          hint="A short buzz when it is time to breathe in or out (phones that support it)."
          checked={s.haptics}
          onChange={(haptics) => update({ haptics })}
        />
      </div>
    </section>
  );
}

const KINDS = [
  { kind: 'checkin', name: 'Daily check-in', hint: 'A one-tap question about how you are.', time: '10:00' },
  { kind: 'journal', name: 'Journal page', hint: 'A nudge to write a few lines about your day.', time: '21:30' },
  { kind: 'practice', name: 'Practice while calm', hint: 'Two minutes with your go-to, so it is easier when you need it.', time: '18:00' },
];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ReminderRow({ def, reminder, onChange }) {
  const [time, setTime] = useState(reminder?.time ?? def.time);
  const [days, setDays] = useState(reminder?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const enabled = Boolean(reminder?.enabled);

  useEffect(() => {
    if (reminder) {
      setTime(reminder.time);
      setDays(reminder.days);
    }
  }, [reminder]);

  const save = (patch) => onChange(def.kind, { time, days, enabled: true, ...patch });

  return (
    <div className="reminder">
      <Toggle
        label={def.name}
        hint={def.hint}
        checked={enabled}
        onChange={(on) => (on ? save({ enabled: true }) : onChange(def.kind, { time, days, enabled: false }))}
      />
      {enabled && (
        <div className="reminder__controls">
          <label className="sr-only" htmlFor={`time-${def.kind}`}>
            Time for {def.name}
          </label>
          <input
            id={`time-${def.kind}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => save({ time })}
          />
          {DAYS.map((d, i) => (
            <button
              key={DAY_NAMES[i]}
              type="button"
              className={`day-chip ${days.includes(i) ? 'is-on' : ''}`}
              aria-pressed={days.includes(i)}
              aria-label={DAY_NAMES[i]}
              onClick={() => {
                const next = days.includes(i) ? days.filter((x) => x !== i) : [...days, i];
                if (!next.length) return;
                setDays(next);
                save({ days: next });
              }}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Reminders() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pushState, setPushState] = useState('unknown'); // unknown | on | off
  const [pushMessage, setPushMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api('/reminders'));
      setPushState((await currentSubscription().catch(() => null)) ? 'on' : 'off');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function change(kind, { time, days, enabled }) {
    setError('');
    try {
      const { reminder } = await api(`/reminders/${kind}`, {
        method: 'PUT',
        body: { time, days, enabled, timezone: deviceTimezone() },
      });
      setData((d) => ({ ...d, reminders: [...d.reminders.filter((r) => r.kind !== kind), reminder] }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePush() {
    setBusy(true);
    setPushMessage('');
    try {
      if (pushState === 'on') {
        await disablePush();
        setPushState('off');
        setPushMessage('Notifications are off on this device.');
      } else {
        await enablePush(data.push.publicKey);
        setPushState('on');
        await api('/reminders/push/test', { method: 'POST' });
        setPushMessage('Notifications are on. You should see a test one now.');
      }
    } catch (err) {
      setPushMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Loading reminders…</p>;
  const byKind = Object.fromEntries(data.reminders.map((r) => [r.kind, r]));

  return (
    <section className="card">
      <h2 className="section-title">Reminders</h2>
      <p className="muted small">
        Gentle, never more than once a day each. If you miss one, it just waits quietly on the home screen.
      </p>
      {KINDS.map((def) => (
        <ReminderRow key={def.kind} def={def} reminder={byKind[def.kind]} onChange={change} />
      ))}
      {error && <p className="error-text">{error}</p>}
      <div className="setting" style={{ marginTop: 12 }}>
        <span className="setting__text">
          Notifications on this device
          <small>
            {data.push.available
              ? pushSupported()
                ? 'So reminders arrive even when Luma is closed.'
                : 'This browser does not support notifications. Reminders still show in the app.'
              : 'Not set up on this server yet. Reminders still show in the app.'}
          </small>
        </span>
        {data.push.available && pushSupported() && (
          <button type="button" className="button button--small button--quiet" onClick={togglePush} disabled={busy}>
            {pushState === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
      {pushMessage && <p className="muted small" role="status">{pushMessage}</p>}
    </section>
  );
}

export default function You() {
  const { isLoggedIn, user, profile, logout, pendingRatings } = useAppState();
  const navigate = useNavigate();

  function doLogout() {
    if (pendingRatings > 0 && !window.confirm(`${pendingRatings} rating(s) have not synced yet and will be lost. Log out anyway?`)) {
      return;
    }
    logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="page page--narrow">
      <h1 className="page-title">{isLoggedIn ? 'You' : 'Settings'}</h1>
      {isLoggedIn && (
        <section className="card">
          <h2 className="section-title">Your go-to</h2>
          {profile?.onboardingComplete ? (
            <p>
              Luma usually opens <strong>{techniqueName(profile.goTo)}</strong> first, and adjusts for the time of day as
              your ratings add up.
            </p>
          ) : (
            <p>Not set up yet. Answer a few questions and try the techniques once to set it.</p>
          )}
          <Link to="/onboarding" className="button button--quiet button--small">
            {profile?.onboardingComplete ? 'Redo the questions and practice' : 'Set up your go-to'}
          </Link>
        </section>
      )}
      <Appearance />
      <Accessibility />
      {isLoggedIn && <Reminders />}
      <section className="card">
        <h2 className="section-title">Install Luma on your phone</h2>
        <p className="muted">
          Open your browser menu and choose &ldquo;Add to Home screen&rdquo; or &ldquo;Install app&rdquo;. Luma then opens
          full-screen, and the techniques work with no connection.
        </p>
      </section>
      <Helplines compact />
      <Disclaimer />
      {isLoggedIn ? (
        <>
          <p className="muted small">Logged in as {user?.email}</p>
          <button type="button" className="button button--quiet" onClick={doLogout}>
            Log out
          </button>
        </>
      ) : (
        <Link to="/signup" className="button button--primary">
          Create a profile
        </Link>
      )}
    </div>
  );
}
