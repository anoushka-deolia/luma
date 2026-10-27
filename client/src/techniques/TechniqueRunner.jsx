import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Pacer from './Pacer.jsx';
import Grounding54321 from './Grounding54321.jsx';
import MuscleRelaxation from './MuscleRelaxation.jsx';
import MentalGrounding from './MentalGrounding.jsx';
import RatingScale from '../components/RatingScale.jsx';
import { TECHNIQUES, DEFAULT_ORDER, techniqueName } from '../lib/techniques.js';
import { useAppState } from '../lib/AppState.jsx';
import { queueRating } from '../lib/outbox.js';

const COMPONENTS = {
  pacer: Pacer,
  'grounding-54321': Grounding54321,
  pmr: MuscleRelaxation,
  'mental-grounding': MentalGrounding,
};

export function nextTechnique(current, order) {
  const list = order?.length ? order : DEFAULT_ORDER;
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

/**
 * Runs one technique full-screen. In a hard moment (mode "crisis") there is
 * nothing to fill in first: ratings are asked only afterwards, and only for
 * people with a profile. In onboarding (mode "practice") the person rates
 * how helpful it felt.
 */
export default function TechniqueRunner({ technique, mode = 'crisis', order, reason, onPracticeRated, onCancel }) {
  const navigate = useNavigate();
  const { isLoggedIn, noteQueued, syncRatings } = useAppState();
  const [stage, setStage] = useState('run'); // run | rate | done | practice-rate
  const [outcome, setOutcome] = useState(null); // calmer | switch
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [helpful, setHelpful] = useState(null);
  const [savedNote, setSavedNote] = useState('');
  const Component = COMPONENTS[technique];
  const next = nextTechnique(technique, order);

  function goNext() {
    navigate(TECHNIQUES[next].path, { state: { switchedFrom: technique } });
  }

  function finish(result) {
    setOutcome(result);
    if (isLoggedIn) {
      setStage('rate');
    } else if (result === 'switch') {
      goNext();
    } else {
      setStage('done');
    }
  }

  async function saveRating(event) {
    event.preventDefault();
    if (before && after) {
      queueRating({ technique, before, after });
      noteQueued();
      const ok = navigator.onLine !== false;
      setSavedNote(ok ? 'Saved. Luma will use this to pick what opens first next time.' : 'Saved on this phone. It will sync when you are back online.');
      syncRatings().catch(() => {});
    }
    if (outcome === 'switch') goNext();
    else setStage('done');
  }

  if (!Component) return <p className="error-text">That technique does not exist.</p>;

  if (stage === 'rate') {
    return (
      <form className="rate-panel" onSubmit={saveRating}>
        <h2 className="page-title">How are you now?</h2>
        <p className="muted">Two taps. This is how Luma learns what works for you.</p>
        <RatingScale
          name="before"
          label="How strong was it when you started?"
          value={before}
          onChange={setBefore}
        />
        <RatingScale name="after" label="How strong is it right now?" value={after} onChange={setAfter} />
        <div className="stack-buttons">
          <button type="submit" className="button button--primary" disabled={!before || !after}>
            {outcome === 'switch' ? `Save and try ${techniqueName(next)}` : 'Save'}
          </button>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => (outcome === 'switch' ? goNext() : setStage('done'))}
          >
            {outcome === 'switch' ? `Skip and try ${techniqueName(next)}` : 'Skip this time'}
          </button>
        </div>
      </form>
    );
  }

  if (stage === 'practice-rate') {
    return (
      <div className="rate-panel">
        <h2 className="page-title">How helpful did that feel?</h2>
        <p className="muted">There is no wrong answer. Different things work for different people.</p>
        <RatingScale name="helpful" kind="helpful" label={techniqueName(technique)} value={helpful} onChange={setHelpful} />
        <div className="stack-buttons">
          <button
            type="button"
            className="button button--primary"
            disabled={!helpful}
            onClick={() => onPracticeRated?.(helpful)}
          >
            Save rating
          </button>
          <button type="button" className="button button--quiet" onClick={() => setStage('run')}>
            Try it a bit longer
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="rate-panel">
        <h2 className="page-title">Well done for staying with it.</h2>
        {savedNote && <p className="muted">{savedNote}</p>}
        <div className="stack-buttons">
          <button type="button" className="button button--primary" onClick={() => setStage('run')}>
            Keep going with {techniqueName(technique).toLowerCase()}
          </button>
          {isLoggedIn ? (
            <Link className="button button--quiet" to="/journal">
              Write about it on today&rsquo;s journal page
            </Link>
          ) : (
            <Link className="button button--quiet" to="/signup">
              Create a profile so Luma remembers what helps
            </Link>
          )}
          <Link className="button button--quiet" to="/community">
            Talk to others who get it
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="runner" aria-label={techniqueName(technique)}>
      <header className="runner__header">
        <h1 className="runner__title">{techniqueName(technique)}</h1>
        {mode === 'crisis' && (
          <div className="runner__switch">
            <button type="button" className="link-button" onClick={goNext}>
              Not working? Try another
            </button>
            {technique !== 'pacer' && (
              <Link className="link-button" to={TECHNIQUES.pacer.path}>
                Breathing pacer
              </Link>
            )}
          </div>
        )}
        {reason && <p className="runner__reason">{reason}</p>}
        {mode === 'practice' && onCancel && (
          <button type="button" className="link-button" onClick={onCancel}>
            Back to the list
          </button>
        )}
      </header>

      <div className="runner__body">
        <Component key={technique} />
      </div>

      <footer className="runner__actions">
        {mode === 'crisis' ? (
          <>
            <button type="button" className="button button--big button--calm" onClick={() => finish('calmer')}>
              I feel calmer
            </button>
            <button type="button" className="button button--big button--switch" onClick={() => finish('switch')}>
              This isn&rsquo;t helping
            </button>
          </>
        ) : (
          <button type="button" className="button button--big button--calm" onClick={() => setStage('practice-rate')}>
            I&rsquo;ve tried it
          </button>
        )}
      </footer>
    </section>
  );
}
