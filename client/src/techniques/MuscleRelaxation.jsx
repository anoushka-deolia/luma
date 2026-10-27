import { useEffect, useState } from 'react';

const GROUPS = [
  { name: 'Hands', tense: 'Make tight fists with both hands.' },
  { name: 'Arms', tense: 'Bend your elbows and tighten your upper arms.' },
  { name: 'Shoulders', tense: 'Lift your shoulders up toward your ears.' },
  { name: 'Face', tense: 'Scrunch your eyes and press your lips together.' },
  { name: 'Stomach', tense: 'Pull your stomach muscles in tight.' },
  { name: 'Legs', tense: 'Press your knees together and tighten your thighs.' },
  { name: 'Feet', tense: 'Curl your toes down, hard.' },
];
const TENSE_SECONDS = 5;
const RELEASE_SECONDS = 10;

export default function MuscleRelaxation() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('ready'); // ready | tense | release | done
  const [secondsLeft, setSecondsLeft] = useState(TENSE_SECONDS);
  const [paused, setPaused] = useState(false);
  const group = GROUPS[index];

  useEffect(() => {
    if (phase !== 'tense' && phase !== 'release') return undefined;
    if (paused) return undefined;
    if (secondsLeft <= 0) {
      if (phase === 'tense') {
        setPhase('release');
        setSecondsLeft(RELEASE_SECONDS);
      } else if (index + 1 < GROUPS.length) {
        setIndex(index + 1);
        setPhase('tense');
        setSecondsLeft(TENSE_SECONDS);
      } else {
        setPhase('done');
      }
      return undefined;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft, paused, index]);

  if (phase === 'done') {
    return (
      <div className="technique-panel">
        <p className="technique-big">That was your whole body.</p>
        <p className="technique-text">Notice where it feels heavier or looser than before.</p>
        <button type="button" className="button button--quiet" onClick={() => { setIndex(0); setPhase('ready'); }}>
          Start again
        </button>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="technique-panel">
        <h2 className="technique-heading">Tense, then let go</h2>
        <p className="technique-text">
          One part of your body at a time: squeeze for {TENSE_SECONDS} seconds, then release for{' '}
          {RELEASE_SECONDS}. Squeeze firmly, but stop if anything hurts.
        </p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            setPhase('tense');
            setSecondsLeft(TENSE_SECONDS);
          }}
        >
          Start with your hands
        </button>
      </div>
    );
  }

  const total = phase === 'tense' ? TENSE_SECONDS : RELEASE_SECONDS;
  return (
    <div className="technique-panel">
      <p className="technique-progress">
        {group.name} ({index + 1} of {GROUPS.length})
      </p>
      <h2 className="technique-heading" aria-live="polite">
        {phase === 'tense' ? 'Squeeze' : 'Let go'}
      </h2>
      <p className="technique-text">
        {phase === 'tense' ? group.tense : 'Release all at once and feel the tension drain out.'}
      </p>
      <div
        className={`countdown countdown--${phase}`}
        style={{ '--fill': `${((total - secondsLeft) / total) * 100}%` }}
        role="timer"
        aria-label={`${secondsLeft} seconds left`}
      >
        <span>{secondsLeft}</span>
      </div>
      <button type="button" className="button button--quiet" onClick={() => setPaused((p) => !p)}>
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
}
