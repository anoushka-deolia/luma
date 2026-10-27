// Pure helpers for reminders, kept separate so they can be tested without a clock.

export const REMINDER_COPY = {
  checkin: {
    title: 'A gentle check-in',
    body: 'How are you feeling today? One tap is enough.',
    url: '/?checkin=1',
  },
  journal: {
    title: 'Your page for today',
    body: 'A few lines about today, whenever you are ready. No pressure.',
    url: '/journal',
  },
  practice: {
    title: 'Two calm minutes?',
    body: 'Practising while calm makes it easier to use in a hard moment.',
    url: '/',
  },
};

// How late a reminder can still be sent (for example, if the server was asleep).
export const LATE_WINDOW_MINUTES = 30;

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The local date, weekday and minutes-since-midnight for `now` in `timezone`. */
export function localNow(now, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Is this reminder due right now? Due means: enabled, today is one of its
 * days, its time has passed by less than the late window, and it has not
 * already been sent today.
 */
export function isDue(reminder, now = new Date()) {
  if (!reminder.enabled) return false;
  const local = localNow(now, reminder.timezone);
  if (!reminder.days.includes(local.weekday)) return false;
  if (reminder.lastSentDate === local.date) return false;
  const late = local.minutes - toMinutes(reminder.time);
  return late >= 0 && late < LATE_WINDOW_MINUTES;
}

/** For the in-app fallback: has today's time passed (at any lateness)? */
export function hasPassedToday(reminder, now = new Date()) {
  if (!reminder.enabled) return false;
  const local = localNow(now, reminder.timezone);
  if (!reminder.days.includes(local.weekday)) return false;
  return local.minutes >= toMinutes(reminder.time);
}
