import { useEffect, useState } from 'react';

const STEPS = [
  { count: 5, sense: 'see', prompt: 'Look around. Name five things you can see.' },
  { count: 4, sense: 'feel', prompt: 'Notice four things you can feel: your feet, your clothes, the chair.' },
  { count: 3, sense: 'hear', prompt: 'Listen for three things you can hear, near or far.' },
  { count: 2, sense: 'smell', prompt: 'Find two things you can smell, or two smells you like.' },
  { count: 1, sense: 'taste', prompt: 'Notice one thing you can taste right now.' },
];

export default function Grounding54321() {
  const [stepIndex, setStepIndex] = useState(0);
  const [found, setFound] = useState(0);
  const done = stepIndex >= STEPS.length;
  const step = STEPS[stepIndex];

  useEffect(() => {
    if (!step || found < step.count) return undefined;
    const t = setTimeout(() => {
      setStepIndex((i) => i + 1);
      setFound(0);
    }, 700);
    return () => clearTimeout(t);
  }, [found, step]);

  if (done) {
    return (
      <div className="technique-panel">
        <p className="technique-big">You noticed fifteen things.</p>
        <p className="technique-text">Your attention is here, in this room, right now.</p>
        <button type="button" className="button button--quiet" onClick={() => { setStepIndex(0); setFound(0); }}>
          Go through it again
        </button>
      </div>
    );
  }

  return (
    <div className="technique-panel">
      <p className="technique-count" aria-hidden="true">{step.count}</p>
      <h2 className="technique-heading">Things you can {step.sense}</h2>
      <p className="technique-text">{step.prompt}</p>
      <button
        type="button"
        className="tap-target"
        onClick={() => setFound((f) => Math.min(step.count, f + 1))}
        aria-label={`I noticed one. ${found} of ${step.count} so far.`}
      >
        <span className="tap-dots" aria-hidden="true">
          {Array.from({ length: step.count }, (_, i) => (
            <span key={i} className={i < found ? 'filled' : ''} />
          ))}
        </span>
        <span>Tap for each one you notice</span>
      </button>
      <p className="technique-progress" aria-live="polite">
        Step {stepIndex + 1} of {STEPS.length}
      </p>
    </div>
  );
}
