import { io } from 'socket.io-client';
import { API_URL, getToken } from './api.js';

let socket = null;

/**
 * One shared connection for the help feed (and, for moderators, live queue
 * updates), opened only while one of those screens is showing. The login
 * token is read at connect time, so logging in or out takes effect on the
 * next connection.
 */
export function getSocket() {
  if (!socket) {
    socket = io(API_URL || undefined, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10_000,
      auth: (cb) => cb({ token: getToken() }),
    });
  }
  return socket;
}

let users = 0;
export function acquireSocket() {
  const s = getSocket();
  users += 1;
  if (!s.connected) s.connect();
  return () => {
    users -= 1;
    if (users <= 0) {
      users = 0;
      s.disconnect();
    }
  };
}
