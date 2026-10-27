import { describe, expect, it } from 'vitest';
import { createJournalKey, decryptText, encryptText, unlockJournal } from '../lib/crypto.js';

describe('journal encryption', () => {
  it('round-trips text and never sends plain text', async () => {
    const { key, journalKey } = await createJournalKey('correct horse battery');
    const sealed = await encryptText(key, 'A hard day, but I got through it.');
    expect(sealed.ciphertext).not.toContain('hard day');
    expect(await decryptText(key, sealed)).toBe('A hard day, but I got through it.');
    expect(journalKey.salt).toHaveLength(24);
    expect(sealed.iv).toHaveLength(16);
  });

  it('unlocks with the right passphrase only', async () => {
    const { journalKey } = await createJournalKey('correct horse battery');
    expect(await unlockJournal('wrong passphrase', journalKey)).toBeNull();
    expect(await unlockJournal('correct horse battery', journalKey)).not.toBeNull();
  });

  it('detects tampered ciphertext', async () => {
    const { key } = await createJournalKey('correct horse battery');
    const sealed = await encryptText(key, 'secret');
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
    await expect(decryptText(key, tampered)).rejects.toThrow();
  });
});
