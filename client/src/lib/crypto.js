// End-to-end encryption for the journal, using the browser's Web Crypto API.
// A key is derived from the passphrase with PBKDF2 and used for AES-GCM.
// The server only ever receives ciphertext, the IV and the salt.

const ITERATIONS = 310_000; // OWASP guidance for PBKDF2-HMAC-SHA256
const VERIFIER_TEXT = 'luma-journal-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const cryptoAvailable = () => Boolean(globalThis.crypto?.subtle);

export function toBase64(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

export function fromBase64(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveKey(passphrase, saltB64) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // the key can't be exported, even by code running on the page
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
}

/** Throws if the key is wrong or the data was changed (AES-GCM checks both). */
export async function decryptText(key, { ciphertext, iv }) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return decoder.decode(plain);
}

/** New journal: a random salt plus an encrypted known value to check the passphrase later. */
export async function createJournalKey(passphrase) {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt);
  const verifier = await encryptText(key, VERIFIER_TEXT);
  return { key, journalKey: { salt, verifierCiphertext: verifier.ciphertext, verifierIv: verifier.iv } };
}

/** Returns the key if the passphrase is right, or null if it is wrong. */
export async function unlockJournal(passphrase, journalKey) {
  const key = await deriveKey(passphrase, journalKey.salt);
  try {
    const text = await decryptText(key, {
      ciphertext: journalKey.verifierCiphertext,
      iv: journalKey.verifierIv,
    });
    return text === VERIFIER_TEXT ? key : null;
  } catch {
    return null;
  }
}
