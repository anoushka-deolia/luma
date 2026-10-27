export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'luma.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the session lasts until the tab closes.
  }
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK', fields } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  get isNetwork() {
    return this.code === 'NETWORK';
  }

  get isAuth() {
    return this.status === 401;
  }
}

/**
 * fetch wrapper: sends the token, turns every failure into an ApiError with
 * a message that can be shown as-is, and announces expired logins so the app
 * can ask the person to log in again without losing what they were doing.
 */
export async function api(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(
      navigator.onLine === false
        ? 'You are offline. This will work again when you are back online.'
        : 'Luma could not reach the server. Check your connection and try again.',
    );
  }

  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON (for example a proxy error page).
  }
  if (!res.ok) {
    const error = new ApiError(data?.error || 'Something went wrong. Please try again.', {
      status: res.status,
      code: data?.code || 'HTTP_ERROR',
      fields: data?.fields,
    });
    if (res.status === 401 && token) {
      window.dispatchEvent(new CustomEvent('luma:auth-expired', { detail: error }));
    }
    throw error;
  }
  return data;
}
