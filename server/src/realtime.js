import { Server } from 'socket.io';
import { config } from './config.js';
import { verifyToken } from './middleware/auth.js';
import { User } from './models/User.js';

/**
 * The help feed is broadcast-only over Socket.IO: posts and replies are
 * created through the REST API (where they are validated, rate-limited and
 * tied to an account), then pushed to everyone viewing the feed.
 * Broadcast payloads never contain author ids.
 *
 * Moderators who connect with their login token also join a "moderators"
 * room, which is told when the review queue changes.
 */
export function attachRealtime(server) {
  const io = new Server(server, {
    cors: { origin: config.clientOrigins },
    serveClient: false,
  });

  io.on('connection', async (socket) => {
    socket.join('feed');
    const token = socket.handshake.auth?.token;
    if (!token) return;
    try {
      const user = await User.findById(verifyToken(token)).select('role');
      if (user?.role === 'moderator') socket.join('moderators');
    } catch {
      // An expired or bad token just means a normal feed connection.
    }
  });

  return io;
}

export function broadcast(app, event, payload, room = 'feed') {
  app.get('io')?.to(room).emit(event, payload);
}
