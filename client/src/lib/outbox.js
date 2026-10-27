import { api } from './api.js';
import { readJson, writeJson, uuid } from './storage.js';
import { localHourNow, todayLocal } from './time.js';

// Session ratings are saved here first, then sent. If the person is offline
// or the server is down, they stay queued and are retried later. Each one
// carries a clientId, so the server ignores a retry that already arrived.
// The local date and hour are captured now, when it happened, not when it syncs.
const KEY = 'luma.outbox';

export function queuedRatings() {
  return readJson(KEY, []);
}

export function queueRating({ technique, before, after }) {
  const item = {
    technique,
    before,
    after,
    clientId: uuid(),
    occurredAt: new Date().toISOString(),
    localDate: todayLocal(),
    localHour: localHourNow(),
  };
  writeJson(KEY, [...queuedRatings(), item]);
  return item;
}

let flushing = null;

/**
 * Sends every queued rating. Resolves with the latest profile returned by the
 * server (so the go-to updates), or null if nothing could be sent.
 */
export function flushRatings() {
  if (flushing) return flushing;
  flushing = (async () => {
    let latestProfile = null;
    for (const item of queuedRatings()) {
      try {
        const res = await api('/sessions', { method: 'POST', body: item });
        latestProfile = res;
        remove(item.clientId);
      } catch (err) {
        if (err.isNetwork || err.isAuth || err.status >= 500 || err.status === 429) break; // try again later
        remove(item.clientId); // the server rejected it as invalid: retrying won't help
      }
    }
    return latestProfile;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

function remove(clientId) {
  writeJson(
    KEY,
    queuedRatings().filter((i) => i.clientId !== clientId),
  );
}

export function clearRatings() {
  writeJson(KEY, null);
}
