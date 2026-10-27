import webpush from 'web-push';
import { config } from '../config.js';
import { User } from '../models/User.js';

let configured = false;

export function pushEnabled() {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    configured = true;
  }
  return true;
}

// Tests replace this to check what would have been sent.
let sender = (subscription, payload) => webpush.sendNotification(subscription, payload, { TTL: 60 * 60 });
export function setPushSender(fn) {
  sender = fn;
}

/**
 * Sends one notification to every device the person turned notifications on
 * for. Subscriptions the browser has revoked (404/410) are removed.
 * Returns how many devices it reached.
 */
export async function sendToUser(userId, message) {
  const user = await User.findById(userId).select('+pushSubscriptions');
  if (!user?.pushSubscriptions?.length) return 0;
  const payload = JSON.stringify(message);
  let delivered = 0;
  const gone = [];
  await Promise.all(
    user.pushSubscriptions.map(async (sub) => {
      try {
        await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        delivered += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(sub.endpoint);
        else console.warn('Push failed:', err?.statusCode || err?.message);
      }
    }),
  );
  if (gone.length) {
    await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: { $in: gone } } } });
  }
  return delivered;
}
