import { api } from './api.js';

// Web Push: the browser gives us a subscription for this device, the server
// stores it and sends reminders to it. Works in the installed or deployed app
// (a service worker is required), not in the development server.

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  if (!reg) {
    throw new Error('Notifications work in the installed or deployed app. Open Luma from its web address or home screen icon to turn them on.');
  }
  return reg;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(publicKey) {
  if (!pushSupported()) throw new Error('This browser does not support notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked for Luma. You can allow them in your browser’s site settings.');
  }
  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = subscription.toJSON();
  await api('/reminders/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api('/reminders/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe();
}
