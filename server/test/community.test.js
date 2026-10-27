import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import { api, app, signup } from './helpers.js';
import { attachRealtime } from '../src/realtime.js';

async function member() {
  const m = await signup();
  await api().post('/api/auth/guidelines').set(m.auth).expect(200);
  return m;
}

describe('help feed', () => {
  it('requires the guidelines before a first post', async () => {
    const { auth } = await signup();
    const res = await api().post('/api/posts').set(auth).send({ text: 'Having a hard night.' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('GUIDELINES_REQUIRED');
  });

  it('lets guests read but not post', async () => {
    const author = await member();
    await api().post('/api/posts').set(author.auth).send({ text: 'Anyone else awake?' }).expect(201);
    const feed = await api().get('/api/posts');
    expect(feed.status).toBe(200);
    expect(feed.body.posts).toHaveLength(1);
    expect((await api().post('/api/posts').send({ text: 'hi' })).status).toBe(401);
  });

  it('never exposes who wrote a post', async () => {
    const author = await member();
    const { post } = (await api().post('/api/posts').set(author.auth).send({ text: 'Struggling today.' })).body;
    expect(post.handle).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/);
    const raw = JSON.stringify((await api().get('/api/posts')).body);
    expect(raw).not.toContain(author.user.id);
    expect(raw).not.toContain(author.user.email);
    expect(raw).not.toMatch(/"author"/);
  });

  it('keeps a handle stable within a thread and marks the original poster', async () => {
    const author = await member();
    const helper = await member();
    const { post } = (await api().post('/api/posts').set(author.auth).send({ text: 'Panic again.' })).body;
    const r1 = (await api().post(`/api/posts/${post.id}/replies`).set(helper.auth).send({ text: 'You are not alone.' })).body.reply;
    const r2 = (await api().post(`/api/posts/${post.id}/replies`).set(author.auth).send({ text: 'Thank you.' })).body.reply;
    const r3 = (await api().post(`/api/posts/${post.id}/replies`).set(helper.auth).send({ text: 'Try the 5-4-3-2-1.' })).body.reply;
    expect(r2.handle).toBe(post.handle);
    expect(r2.isOriginalPoster).toBe(true);
    expect(r1.handle).toBe(r3.handle);
    expect(r1.handle).not.toBe(post.handle);
  });

  it('marks only the viewer’s own posts as mine', async () => {
    const a = await member();
    const b = await member();
    await api().post('/api/posts').set(a.auth).send({ text: 'From A' });
    const asA = (await api().get('/api/posts').set(a.auth)).body.posts[0];
    const asB = (await api().get('/api/posts').set(b.auth)).body.posts[0];
    expect(asA.mine).toBe(true);
    expect(asB.mine).toBe(false);
  });

  it('rejects empty or overlong posts', async () => {
    const { auth } = await member();
    expect((await api().post('/api/posts').set(auth).send({ text: '   \n\n ' })).status).toBe(400);
    expect((await api().post('/api/posts').set(auth).send({ text: 'x'.repeat(1001) })).status).toBe(400);
  });

  it('only lets authors delete their own posts', async () => {
    const a = await member();
    const b = await member();
    const { post } = (await api().post('/api/posts').set(a.auth).send({ text: 'mine' })).body;
    expect((await api().delete(`/api/posts/${post.id}`).set(b.auth)).status).toBe(404);
    expect((await api().delete(`/api/posts/${post.id}`).set(a.auth)).status).toBe(204);
  });

  it('hides a post after three different people report it', async () => {
    const author = await member();
    const reporters = [await member(), await member(), await member()];
    const { post } = (await api().post('/api/posts').set(author.auth).send({ text: 'something unkind' })).body;

    const first = await api().post('/api/reports').set(reporters[0].auth).send({ postId: post.id });
    expect(first.body.hidden).toBe(false);
    const again = await api().post('/api/reports').set(reporters[0].auth).send({ postId: post.id });
    expect(again.status).toBe(409);
    expect((await api().get('/api/posts')).body.posts).toHaveLength(1);

    await api().post('/api/reports').set(reporters[1].auth).send({ postId: post.id }).expect(201);
    const third = await api().post('/api/reports').set(reporters[2].auth).send({ postId: post.id });
    expect(third.body.hidden).toBe(true);
    expect((await api().get('/api/posts')).body.posts).toHaveLength(0);
  });

  it('does not allow reporting your own post', async () => {
    const a = await member();
    const { post } = (await api().post('/api/posts').set(a.auth).send({ text: 'mine' })).body;
    expect((await api().post('/api/reports').set(a.auth).send({ postId: post.id })).body.code).toBe('OWN_CONTENT');
  });
});

describe('rate limits', () => {
  it('stops rapid posting with a clear message', async () => {
    const { auth } = await member();
    const statuses = [];
    process.env.TEST_RATE_LIMITS = '1';
    try {
      for (let i = 0; i < 4; i += 1) {
        statuses.push((await api().post('/api/posts').set(auth).send({ text: `post ${i}` })).status);
      }
    } finally {
      delete process.env.TEST_RATE_LIMITS;
    }
    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses[3]).toBe(429);
  });
});

describe('live updates', () => {
  let server;
  let url;
  beforeAll(async () => {
    server = http.createServer(app);
    app.set('io', attachRealtime(server));
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    app.get('io').close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('pushes new posts and replies to everyone in the feed, without author ids', async () => {
    const author = await member();
    const viewer = connect(url, { transports: ['websocket'] });
    await new Promise((resolve) => viewer.on('connect', resolve));

    const gotPost = new Promise((resolve) => viewer.once('post:new', resolve));
    const { post } = (await api().post('/api/posts').set(author.auth).send({ text: 'live one' })).body;
    const pushed = await gotPost;
    expect(pushed.id).toBe(post.id);
    expect(pushed).not.toHaveProperty('mine');
    expect(JSON.stringify(pushed)).not.toContain(author.user.id);

    const gotReply = new Promise((resolve) => viewer.once('reply:new', resolve));
    await api().post(`/api/posts/${post.id}/replies`).set(author.auth).send({ text: 'replying live' });
    const reply = await gotReply;
    expect(reply.postId).toBe(post.id);
    expect(reply.reply.text).toBe('replying live');
    viewer.close();
  });
});
