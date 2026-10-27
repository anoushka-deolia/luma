export function Disclaimer() {
  return (
    <p className="disclaimer">
      Luma is self-support and peer support. It is not medical care, therapy or emergency help.
    </p>
  );
}

/** Permanent banner for the help section, and reused on the account page. */
export default function Helplines({ compact = false }) {
  return (
    <aside className={`helplines ${compact ? 'helplines--compact' : ''}`} aria-label="Crisis helplines">
      <p className="helplines__lead">If you might hurt yourself or you are in danger, please call now.</p>
      <p className="helplines__numbers">
        In India: <a href="tel:14416">Tele-MANAS 14416</a> (free, any time) or{' '}
        <a href="tel:112">emergency 112</a>.
      </p>
      {!compact && (
        <p className="helplines__note">
          People here are peers, not professionals. Luma is not medical or emergency help.
        </p>
      )}
    </aside>
  );
}
