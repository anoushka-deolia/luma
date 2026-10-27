// The journal key lives only in memory, for as long as the tab is open and
// the journal is unlocked. It is never stored or sent anywhere.
let key = null;
const listeners = new Set();

export const getJournalKey = () => key;

export function setJournalKey(next) {
  key = next;
  listeners.forEach((fn) => fn(key));
}

export function lockJournal() {
  setJournalKey(null);
}

export function onJournalKeyChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
