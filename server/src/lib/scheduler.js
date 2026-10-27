import { Reminder } from '../models/Reminder.js';
import { REMINDER_COPY, isDue, localNow } from './reminders.js';
import { pushEnabled, sendToUser } from './push.js';

/**
 * One pass over enabled reminders: send the ones that are due and mark them
 * sent for that local day. The `lastSentDate` update is conditional, so if two
 * server instances run at once only one of them sends.
 */
export async function runReminderPass(now = new Date()) {
  if (!pushEnabled()) return 0;
  const reminders = await Reminder.find({ enabled: true });
  let sent = 0;
  for (const reminder of reminders) {
    if (!isDue(reminder, now)) continue;
    const today = localNow(now, reminder.timezone).date;
    const claimed = await Reminder.updateOne(
      { _id: reminder._id, lastSentDate: { $ne: today } },
      { $set: { lastSentDate: today } },
    );
    if (!claimed.modifiedCount) continue;
    const copy = REMINDER_COPY[reminder.kind];
    sent += await sendToUser(reminder.user, { ...copy, tag: `luma-${reminder.kind}` });
  }
  return sent;
}

export function startReminderScheduler(intervalMs = 60_000) {
  if (!pushEnabled()) {
    console.log('Push reminders are off (no VAPID keys). In-app reminders still work.');
    return () => {};
  }
  const timer = setInterval(() => {
    runReminderPass().catch((err) => console.error('Reminder pass failed:', err));
  }, intervalMs);
  timer.unref();
  console.log('Push reminder scheduler started');
  return () => clearInterval(timer);
}
