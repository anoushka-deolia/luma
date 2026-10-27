import { useState } from 'react';

const PROMPTS = [
  'Name five animals, one for each finger.',
  'Count backwards from 100 in sevens.',
  'Name a fruit for every letter from A to F.',
  'Spell your full name backwards.',
  'List four cities you would like to visit, and one thing you would do in each.',
  'Name five things you would find in a kitchen.',
  'Count backwards from 50 in threes.',
  'Think of three songs you know all the words to.',
  'Describe the room you are in, as if to someone on the phone.',
  'Name a colour for each letter of your first name.',
  'List the last five things you ate.',
  'Name five things that are round.',
  'Recite the months of the year backwards.',
  'Name four people you could text right now, and one thing you like about each.',
];

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function MentalGrounding() {
  const [order] = useState(() => shuffled(PROMPTS));
  const [index, setIndex] = useState(0);
  const prompt = order[index % order.length];

  return (
    <div className="technique-panel">
      <h2 className="technique-heading">Give your mind a small job</h2>
      <p className="technique-prompt" aria-live="polite">
        {prompt}
      </p>
      <p className="technique-text">Take your time. Say the answers out loud or in your head.</p>
      <button type="button" className="button button--primary" onClick={() => setIndex((i) => i + 1)}>
        Next one
      </button>
    </div>
  );
}
