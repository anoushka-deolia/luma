const DISTRESS = ['Calm', 'Uneasy', 'Anxious', 'Very anxious', 'Panicking'];
const HELPFUL = ['Not at all', 'A little', 'Somewhat', 'Quite a lot', 'A lot'];

export default function RatingScale({ label, value, onChange, kind = 'distress', name }) {
  const words = kind === 'distress' ? DISTRESS : HELPFUL;
  return (
    <fieldset className="scale">
      <legend className="scale__label">{label}</legend>
      <div className="scale__options" role="radiogroup">
        {words.map((word, i) => {
          const n = i + 1;
          return (
            <label key={n} className={`scale__option ${value === n ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
              />
              <span className="scale__number">{n}</span>
              <span className="scale__word">{word}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
