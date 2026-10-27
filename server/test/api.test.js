import { describe, expect, it } from 'vitest';
import { api, signup } from './helpers.js';
import { User } from '../src/models/User.js';

describe('auth', () => {
  it('signs up, logs in and returns the current user', async () => {
    const { user, auth } = await signup('person@example.com');
    expect(user.email).toBe('person@example.com');

    const login = await api().post('/api/auth/login').send({ email: 'PERSON@example.com', password: 'calm-password-1' });
    expect(login.status).toBe(200);

    const me = await api().get('/api/auth/me').set(auth);
    expect(me.body.user.id).toBe(user.id);
  });

  it('never returns the password hash', async () => {
    const { auth } = await signup();
    const me = await api().get('/api/auth/me').set(auth);
    expect(JSON.stringify(me.body)).not.toMatch(/password/i);
  });

  it('rejects a duplicate email with 409', async () => {
    await signup('dup@example.com');
    const res = await api().post('/api/auth/signup').send({ email: 'dup@example.com', password: 'another-pass-1' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('uses one message for wrong password and unknown email', async () => {
    await signup('known@example.com');
    const wrong = await api().post('/api/auth/login').send({ email: 'known@example.com', password: 'wrong-password' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it('validates input with field messages', async () => {
    const res = await api().post('/api/auth/signup').send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rejects requests without a valid token', async () => {
    expect((await api().get('/api/profile')).status).toBe(401);
    const bad = await api().get('/api/profile').set({ Authorization: 'Bearer nonsense' });
    expect(bad.status).toBe(401);
  });
});

describe('deleted accounts', () => {
  it('asks the person to log in again instead of failing on every screen', async () => {
    const { user, auth } = await signup();
    await User.deleteOne({ _id: user.id ?? user._id });
    const res = await api().get('/api/journal/today').set(auth);
    expect(res.status).toBe(401);
    expect(res.body.error.code ?? res.body.code).toBe('ACCOUNT_GONE');
  });
});

describe('onboarding and go-to', () => {
  it('starts on the pacer, then sets a go-to from answers and practice', async () => {
    const { auth } = await signup();
    let profile = (await api().get('/api/profile').set(auth)).body;
    expect(profile.goTo).toBe('pacer');
    expect(profile.onboardingComplete).toBe(false);

    await api()
      .put('/api/profile/onboarding')
      .set(auth)
      .send({ feelings: ['numb-detached'], worse: ['focusing-on-breath'], helped: [], preferences: ['visual'] })
      .expect(200);

    const early = await api().post('/api/profile/complete').set(auth);
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('NO_PRACTICE');

    await api().put('/api/profile/practice').set(auth).send({ technique: 'grounding-54321', rating: 5 }).expect(200);
    profile = (await api().post('/api/profile/complete').set(auth)).body;
    expect(profile.onboardingComplete).toBe(true);
    expect(profile.goTo).toBe('grounding-54321');
    expect(profile.ranking.at(-1).technique).toBe('pacer');
  });

  it('rejects unknown onboarding answers', async () => {
    const { auth } = await signup();
    const res = await api().put('/api/profile/onboarding').set(auth).send({ feelings: ['made-up'] });
    expect(res.status).toBe(400);
  });
});

describe('sessions', () => {
  const session = (extra = {}) => ({
    technique: 'pmr',
    before: 5,
    after: 2,
    clientId: `c-${Math.random().toString(36).slice(2, 12)}`,
    ...extra,
  });

  it('saves a session and updates the ranking', async () => {
    const { auth } = await signup();
    await api().put('/api/profile/practice').set(auth).send({ technique: 'pacer', rating: 3 });
    await api().post('/api/profile/complete').set(auth);
    const res = await api().post('/api/sessions').set(auth).send(session());
    expect(res.status).toBe(201);
    expect(res.body.session.improvement).toBe(3);
    expect(res.body.goTo).toBe('pmr');
  });

  it('treats a retried session as a no-op', async () => {
    const { auth } = await signup();
    const body = session({ clientId: 'retry-same-id-1' });
    expect((await api().post('/api/sessions').set(auth).send(body)).status).toBe(201);
    const again = await api().post('/api/sessions').set(auth).send(body);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    const stats = (await api().get('/api/sessions/stats').set(auth)).body;
    expect(stats.totalSessions).toBe(1);
  });

  it('keeps each user’s sessions separate', async () => {
    const a = await signup();
    const b = await signup();
    await api().post('/api/sessions').set(a.auth).send(session({ clientId: 'shared-client-1' }));
    // Same clientId from another user is a different session.
    expect((await api().post('/api/sessions').set(b.auth).send(session({ clientId: 'shared-client-1' }))).status).toBe(201);
    expect((await api().get('/api/sessions').set(a.auth)).body.sessions).toHaveLength(1);
  });

  it('reports averages per technique for the progress chart', async () => {
    const { auth } = await signup();
    await api().post('/api/sessions').set(auth).send(session({ before: 4, after: 2 }));
    await api().post('/api/sessions').set(auth).send(session({ before: 5, after: 2 }));
    const { techniques } = (await api().get('/api/sessions/stats').set(auth)).body;
    const pmr = techniques.find((t) => t.technique === 'pmr');
    expect(pmr).toMatchObject({ sessions: 2, avgBefore: 4.5, avgAfter: 2, avgImprovement: 2.5 });
  });

  it('rejects ratings outside 1 to 5', async () => {
    const { auth } = await signup();
    const res = await api().post('/api/sessions').set(auth).send(session({ after: 9 }));
    expect(res.status).toBe(400);
  });
});

describe('journal', () => {
  const key = { salt: 'A'.repeat(22) + '==', verifierCiphertext: 'B'.repeat(40), verifierIv: 'C'.repeat(16) };
  const entry = { ciphertext: 'D'.repeat(64), iv: 'E'.repeat(16) };

  it('stores a passphrase verifier once and only ciphertext entries', async () => {
    const { auth } = await signup();
    expect((await api().post('/api/journal/entries').set(auth).send(entry)).body.code).toBe('JOURNAL_NOT_SET_UP');
    expect((await api().post('/api/journal/setup').set(auth).send(key)).status).toBe(201);
    expect((await api().post('/api/journal/setup').set(auth).send(key)).status).toBe(409);

    const created = await api().post('/api/journal/entries').set(auth).send(entry);
    expect(created.status).toBe(201);
    const list = await api().get('/api/journal/entries').set(auth);
    expect(list.body.entries).toHaveLength(1);
    expect(Object.keys(list.body.entries[0]).sort()).toEqual(
      ['ciphertext', 'createdAt', 'id', 'iv', 'kind', 'localDate', 'promptId', 'updatedAt'],
    );
    expect(list.body.entries[0].kind).toBe('note');
  });

  it('rejects plain text that is not ciphertext', async () => {
    const { auth } = await signup();
    await api().post('/api/journal/setup').set(auth).send(key);
    const res = await api().post('/api/journal/entries').set(auth).send({ ciphertext: 'I felt anxious today!', iv: entry.iv });
    expect(res.status).toBe(400);
  });

  it('never lets one user delete another user’s entry', async () => {
    const a = await signup();
    const b = await signup();
    await api().post('/api/journal/setup').set(a.auth).send(key);
    const { id } = (await api().post('/api/journal/entries').set(a.auth).send(entry)).body.entry;
    expect((await api().delete(`/api/journal/entries/${id}`).set(b.auth)).status).toBe(404);
    expect((await api().delete(`/api/journal/entries/${id}`).set(a.auth)).status).toBe(204);
    expect((await api().delete('/api/journal/entries/not-an-id').set(a.auth)).status).toBe(404);
  });
});
