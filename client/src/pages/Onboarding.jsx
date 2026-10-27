import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAppState } from '../lib/AppState.jsx';
import { DEFAULT_ORDER, ONBOARDING_QUESTIONS, TECHNIQUES, techniqueName } from '../lib/techniques.js';
import TechniqueRunner from '../techniques/TechniqueRunner.jsx';

export default function Onboarding() {
  const { profile, setProfile } = useAppState();
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0..3 questions, 4 practice, 5 result
  const [answers, setAnswers] = useState(() => ({
    feelings: profile?.onboarding?.feelings ?? [],
    helped: profile?.onboarding?.helped ?? [],
    worse: profile?.onboarding?.worse ?? [],
    preferences: profile?.onboarding?.preferences ?? [],
  }));
  const [ratings, setRatings] = useState(() => ({ ...(profile?.practiceRatings ?? {}) }));
  const [practising, setPractising] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const question = ONBOARDING_QUESTIONS[step];

  function toggle(key, value) {
    setAnswers((a) => ({
      ...a,
      [key]: a[key].includes(value) ? a[key].filter((v) => v !== value) : [...a[key], value],
    }));
  }

  async function saveAnswersAndContinue() {
    if (step < ONBOARDING_QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      setProfile(await api('/profile/onboarding', { method: 'PUT', body: answers }));
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePractice(technique, rating) {
    setError('');
    try {
      setProfile(await api('/profile/practice', { method: 'PUT', body: { technique, rating } }));
      setRatings((r) => ({ ...r, [technique]: rating }));
      setPractising(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function finish() {
    setBusy(true);
    setError('');
    try {
      setProfile(await api('/profile/complete', { method: 'POST' }));
      setStep(5);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (practising) {
    return (
      <div className="calm">
        <TechniqueRunner
          technique={practising}
          mode="practice"
          onPracticeRated={(rating) => savePractice(practising, rating)}
          onCancel={() => setPractising(null)}
        />
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    );
  }

  if (step === 5 && profile) {
    return (
      <div className="page page--narrow">
        <h1 className="page-title">Your go-to is {techniqueName(profile.goTo).toLowerCase()}.</h1>
        <p>
          Next time you open Luma, it starts there straight away. If it isn&rsquo;t helping, one tap moves to
          your next best option. Your ratings after each session keep this up to date.
        </p>
        <ol className="ranking-list">
          {profile.ranking.map((r) => (
            <li key={r.technique}>{techniqueName(r.technique)}</li>
          ))}
        </ol>
        <div className="stack-buttons">
          <button type="button" className="button button--primary" onClick={() => navigate('/')}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    const ratedCount = DEFAULT_ORDER.filter((t) => ratings[t]).length;
    return (
      <div className="page page--narrow">
        <p className="muted">Step 2 of 2</p>
        <h1 className="page-title">Try them while you&rsquo;re calm</h1>
        <p>
          Practising now makes a technique easier to use in a hard moment. Try each one for a minute, then
          rate how helpful it felt. Try at least one; all four gives Luma the best picture.
        </p>
        <ul className="practice-list">
          {DEFAULT_ORDER.map((t) => (
            <li key={t} className="practice-item">
              <div>
                <h2 className="practice-item__name">{techniqueName(t)}</h2>
                <p className="muted">{TECHNIQUES[t].short}</p>
              </div>
              <button type="button" className="button button--small" onClick={() => setPractising(t)}>
                {ratings[t] ? `Rated ${ratings[t]}/5. Try again` : 'Try it'}
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="stack-buttons">
          <button type="button" className="button button--primary" disabled={!ratedCount || busy} onClick={finish}>
            {busy ? 'Setting your go-to…' : `Finish with ${ratedCount} of 4 rated`}
          </button>
          <button type="button" className="button button--quiet" onClick={() => setStep(ONBOARDING_QUESTIONS.length - 1)}>
            Back to the questions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <p className="muted">
        Step 1 of 2: question {step + 1} of {ONBOARDING_QUESTIONS.length}
      </p>
      <h1 className="page-title">{question.title}</h1>
      <p className="muted">{question.hint}</p>
      <div className="chips" role="group" aria-label={question.title}>
        {question.options.map((o) => {
          const on = answers[question.key].includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              className={`chip ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(question.key, o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="stack-buttons">
        <button type="button" className="button button--primary" onClick={saveAnswersAndContinue} disabled={busy}>
          {busy ? 'Saving…' : answers[question.key].length ? 'Next' : 'None of these, next'}
        </button>
        {step > 0 ? (
          <button type="button" className="button button--quiet" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <Link to="/" className="button button--quiet">
            Do this later
          </Link>
        )}
      </div>
    </div>
  );
}
