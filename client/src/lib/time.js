const dateTime = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export const formatDateTime = (iso) => dateTime.format(new Date(iso));

const pad = (n) => String(n).padStart(2, '0');

/** Today's date on this device, as YYYY-MM-DD. */
export function todayLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const localHourNow = () => new Date().getHours();

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as a local calendar day (not UTC midnight). */
export function parseDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const formatLongDate = (dateStr) => longDate.format(parseDay(dateStr));
export const formatShortDay = (dateStr) => shortDay.format(parseDay(dateStr));

export function timeOfDay(hour = localHourNow()) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function greeting(hour = localHourNow()) {
  return {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Hello, night owl',
  }[timeOfDay(hour)];
}

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

export function timeAgo(iso, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateTime(iso);
}
