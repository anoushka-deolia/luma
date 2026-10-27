import { useEffect, useRef, useState } from 'react';
import { haptic, useMotionReduced } from '../lib/settings.js';
import {
  DEFAULT_PERIOD,
  TAPS_NEEDED,
  breathPhase,
  breathsPerMinute,
  measurePeriod,
  nextPeriod,
} from './pacerMath.js';

/**
 * Tap-along breathing pacer. The person taps each time they breathe in. Once
 * their own rhythm is measured, the orb starts at that pace and slows each
 * breath a little, easing them toward about six breaths a minute instead of
 * forcing an unfamiliar rhythm on them. Runs entirely on the device.
 *
 * With reduced motion the orb doesn't grow and shrink: its glow and the halo
 * around it show the breath instead. With haptics on, phones give a short
 * buzz at each change between breathing in and out.
 */
export default function Pacer() {
  const reducedMotion = useMotionReduced();
  const [taps, setTaps] = useState([]);
  const [ripples, setRipples] = useState([]);
  const [startPeriod, setStartPeriod] = useState(null); // their measured pace
  const [display, setDisplay] = useState({ phase: 'in', period: DEFAULT_PERIOD });
  const orbRef = useRef(null);
  const guiding = startPeriod !== null;

  // Animation loop. Writes the orb size straight to the DOM for smooth motion
  // and only re-renders React when the phase text changes.
  useEffect(() => {
    let period = startPeriod ?? DEFAULT_PERIOD;
    let cycleStart = performance.now();
    let lastPhase = null;
    let frame;
    const tick = (now) => {
      let elapsed = (now - cycleStart) / 1000;
      if (elapsed >= period) {
        cycleStart = now;
        elapsed = 0;
        if (guiding) period = nextPeriod(period);
      }
      const { phase, progress } = breathPhase(elapsed, period);
      const eased = (1 - Math.cos(Math.PI * progress)) / 2;
      const size = phase === 'in' ? eased : 1 - eased; // 0 = small, 1 = full
      const orb = orbRef.current;
      if (orb) {
        orb.style.setProperty('--orb-scale', reducedMotion ? '0.92' : String(0.56 + size * 0.44));
        orb.style.setProperty('--orb-glow', String(0.3 + size * 0.7));
        orb.style.setProperty('--breath', String(Math.min(1, elapsed / period)));
      }
      if (phase !== lastPhase) {
        if (lastPhase !== null && guiding) haptic(phase === 'in' ? [30] : [15, 60, 15]);
        lastPhase = phase;
        setDisplay({ phase, period });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startPeriod, guiding, reducedMotion]);

  function tap() {
    if (guiding) return;
    haptic(12);
    const id = performance.now();
    if (!reducedMotion) {
      setRipples((r) => [...r.slice(-2), id]);
      setTimeout(() => setRipples((r) => r.filter((x) => x !== id)), 1300);
    }
    const next = [...taps, performance.now()].slice(-6);
    setTaps(next);
    if (next.length >= TAPS_NEEDED) {
      const measured = measurePeriod(next);
      if (measured) setStartPeriod(measured);
    }
  }

  function restart() {
    setTaps([]);
    setStartPeriod(null);
  }

  const remaining = Math.max(0, TAPS_NEEDED - taps.length);
  let instruction;
  if (!guiding) {
    instruction = taps.length === 0 ? 'Tap the circle each time you breathe in' : `Keep tapping as you breathe in (${remaining} more)`;
  } else {
    instruction = display.phase === 'in' ? 'Breathe in' : 'Breathe out, slowly';
  }

  return (
    <div className="pacer">
      <button
        type="button"
        className={`orb ${guiding ? 'orb--guiding' : 'orb--listening'}`}
        ref={orbRef}
        onClick={tap}
        aria-label={guiding ? 'Breathing guide' : 'Tap as you breathe in'}
        aria-disabled={guiding}
      >
        <svg className="orb__halo" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="orb__track" cx="50" cy="50" r="48" pathLength="100" />
          <circle className="orb__progress" cx="50" cy="50" r="48" pathLength="100" />
        </svg>
        <span className="orb__core" aria-hidden="true" />
        {ripples.map((id) => (
          <span key={id} className="orb__ripple" aria-hidden="true" />
        ))}
        {!guiding && taps.length > 0 && (
          <span className="orb__dots" aria-hidden="true">
            {Array.from({ length: TAPS_NEEDED }, (_, i) => (
              <span key={i} className={i < taps.length ? 'filled' : ''} />
            ))}
          </span>
        )}
      </button>
      <p className="pacer__instruction" aria-live="polite">
        {instruction}
      </p>
      {guiding ? (
        <p className="pacer__meta">
          You started at {breathsPerMinute(startPeriod)} breaths a minute. Follow the circle as it slows.{' '}
          <button type="button" className="link-button" onClick={restart}>
            Measure again
          </button>
        </p>
      ) : (
        <p className="pacer__meta">Don&rsquo;t change your breathing yet. Luma is just listening.</p>
      )}
    </div>
  );
}
