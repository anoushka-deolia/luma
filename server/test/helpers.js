import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

let counter = 0;
export async function signup(email = `user${++counter}-${Date.now()}@example.com`) {
  const res = await request(app).post('/api/auth/signup').send({ email, password: 'calm-password-1' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export const api = () => request(app);
