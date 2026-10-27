import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import TechniqueRunner from '../techniques/TechniqueRunner.jsx';
import CheckInSheet, { moodLabel } from '../components/CheckIn.jsx';
import { TECHNIQUES, techniqueName } from '../lib/techniques.js';
import { useAppState } from '../lib/AppState.jsx';
import { readJson, writeJson } from '../lib/storage.js';
import { greeting } from '../lib/time.js';

function reasonText(reason) {
  if (!reason) return null;
  const drop = reason.avgImprovement.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `Picked for ${reason.label}: on ${reason.sessions} ${reason.label.replace(/s$/, '')} sessions it lowered your distress by ${drop} points on average.`;
}

const REMINDER_TEXT = {
  checkin: null, // shown as the check-in chip itself
  journal: { text: 'Your journal page for today is waiting', to: '/journal' },
  practice: { text: 'Practice reminder: two calm minutes with the technique below', to: null },
};

function GuestNudge() {
  const [dismissed, setDismissed] = useState(() => readJson('luma.nudgeDismissed', false));
  if (dismissed) return null;
  return (
    <p className="nudge">
      <Link to="/signup">Create a profile</Link> and Luma will learn which technique helps you most.{' '}
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setDismissed(true);
          writeJson('luma.nudgeDismissed', true);
        }}
        aria-label="Hide this suggestion"
      >
        Hide
      </button>
    </p>
  );
}

/** Greeting, today's check-in, one gentle nudge and any reminders that are due. Never blocks the technique. */
function TodayStrip() {
  const { today, profile, refreshToday } = useAppState();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  // Opened from a reminder notification: /?checkin=1
  useEffect(() => {
    if (params.get('checkin')) {
      setOpen(true);
      params.delete('checkin');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const checkIn = today?.checkIn;
  const reminders = (today?.dueReminders ?? []).map((k) => REMINDER_TEXT[k]).filter(Boolean);

  return (
    <section className="today" aria-label="Today">
      <div className="today__hello">
        <p className="today__greeting">{greeting()}</p>
        <button
          type="button"
          className={`chip chip--small ${checkIn ? 'chip--done' : 'is-on'}`}
          onClick={() => setOpen(true)}
        >
          {checkIn ? `Checked in: ${moodLabel(checkIn.mood)}` : 'Check in for today'}
        </button>
      </div>
      {today?.nudge && !checkIn && <p className="today__nudge">{today.nudge.message}</p>}
      {today?.nudge?.kind === 'welcome-back' && checkIn && <p className="today__nudge">{today.nudge.message}</p>}
      {reminders.map((r) =>
        r.to ? (
          <Link key={r.text} to={r.to} className="nudge">
            {r.text}
          </Link>
        ) : (
          <p key={r.text} className="nudge">
            {r.text}
          </p>
        ),
      )}
      {profile && !profile.onboardingComplete && (
        <p className="nudge">
          <Link to="/onboarding">Set up your go-to</Link> so Luma opens what works for you.
        </p>
      )}
      <CheckInSheet
        open={open}
        initial={checkIn}
        onClose={() => setOpen(false)}
        onSaved={() => refreshToday().catch(() => {})}
      />
    </section>
  );
}

/** "/": the first screen is help itself. Guests get the pacer; profiles get their go-to for this time of day. */
export function CalmHome() {
  const { isLoggedIn, now } = useAppState();
  const location = useLocation();
  return (
    <div className="calm">
      {isLoggedIn ? <TodayStrip /> : <GuestNudge />}
      <TechniqueRunner
        key={`${now.goTo}-${location.key}`}
        technique={now.goTo}
        order={now.order}
        reason={reasonText(now.reason)}
      />
    </div>
  );
}

/** "/calm/:technique": a specific technique, used by "Try another". */
export function CalmTechnique() {
  const { technique } = useParams();
  const { now } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  if (!TECHNIQUES[technique]) return <Navigate to="/" replace />;
  return (
    <div className="calm">
      {location.state?.switchedFrom && (
        <p className="calm__goto" role="status">
          Switched from {techniqueName(location.state.switchedFrom).toLowerCase()}.{' '}
          <button type="button" className="link-button" onClick={() => navigate('/')}>
            Back to your go-to
          </button>
        </p>
      )}
      <TechniqueRunner key={`${technique}-${location.key}`} technique={technique} order={now.order} />
    </div>
  );
}
