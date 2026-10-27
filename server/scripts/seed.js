// Demo data for trying Luma and recording the demo video.
// Usage (from server/): npm run seed
//
// Creates (or resets):
//   demo1@luma.test / demo-password-1   three weeks of sessions, check-ins and journal pages
//                                       journal passphrase: luma demo journal
//   moderator@luma.test / demo-password-1   a moderator, with items waiting in the queue
//   demo2@luma.test, demo3@luma.test    other community members
import { webcrypto } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { connectDb } from '../src/db.js';
import { User } from '../src/models/User.js';
import { TechniqueProfile } from '../src/models/TechniqueProfile.js';
import { Session } from '../src/models/Session.js';
import { CheckIn } from '../src/models/CheckIn.js';
import { JournalEntry } from '../src/models/JournalEntry.js';
import { Post } from '../src/models/Post.js';
import { Reaction } from '../src/models/Reaction.js';
import { Report } from '../src/models/Report.js';
import { Reminder } from '../src/models/Reminder.js';
import { ModerationAction } from '../src/models/ModerationAction.js';
import { threadHandle } from '../src/lib/handles.js';
import { bucketForHour } from '../src/lib/localTime.js';
import { analyseText } from '../src/lib/moderation.js';

const PASSWORD = 'demo-password-1';
const JOURNAL_PASSPHRASE = 'luma demo journal';
const subtle = webcrypto.subtle;

// Same scheme as the app: PBKDF2-SHA256 (310k) -> AES-GCM 256.
const b64 = (buf) => Buffer.from(buf).toString('base64');
async function journalKeyFor(passphrase) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const material = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const seal = async (text) => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    return { ciphertext: b64(ct), iv: b64(iv) };
  };
  const verifier = await seal('luma-journal-v1');
  return { seal, journalKey: { salt: b64(salt), verifierCiphertext: verifier.ciphertext, verifierIv: verifier.iv } };
}

const localDay = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};
const at = (offset, hour, minute = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function person(email, extra = {}) {
  const old = await User.findOne({ email });
  if (old) {
    await Promise.all([
      Session.deleteMany({ user: old._id }),
      CheckIn.deleteMany({ user: old._id }),
      JournalEntry.deleteMany({ user: old._id }),
      Reaction.deleteMany({ user: old._id }),
      Report.deleteMany({ reporter: old._id }),
      Reminder.deleteMany({ user: old._id }),
      TechniqueProfile.deleteMany({ user: old._id }),
      Post.deleteMany({ author: old._id }),
      User.deleteOne({ _id: old._id }),
    ]);
  }
  const user = await User.create({
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 12),
    guidelinesAcceptedAt: new Date(),
    ...extra,
  });
  await TechniqueProfile.create({ user: user._id });
  return user;
}

await connectDb(config.mongoUri);
await ModerationAction.deleteMany({});

const [demo, demo2, demo3, mod] = [
  await person('demo1@luma.test'),
  await person('demo2@luma.test'),
  await person('demo3@luma.test'),
  await person('moderator@luma.test', { role: 'moderator' }),
];

// ---------- demo1: a profile with three weeks of history ----------
await TechniqueProfile.updateOne(
  { user: demo._id },
  {
    $set: {
      onboarding: {
        feelings: ['racing-thoughts', 'body-sensations'],
        helped: ['moving-body'],
        worse: ['thinking-tasks'],
        preferences: ['visual', 'touch'],
      },
      practiceRatings: { pacer: 4, 'grounding-54321': 3, pmr: 4, 'mental-grounding': 2 },
      onboardingComplete: true,
    },
  },
);

// Muscle relaxation works best at night, the pacer during the day.
const sessions = [];
let n = 0;
for (let day = -20; day <= -1; day += 1) {
  if ([-17, -12, -9, -4].includes(day)) continue; // some days off, like real life
  const night = day % 2 === 0;
  const hour = night ? 23 : 15;
  const technique = night ? (day % 4 === 0 ? 'pmr' : 'grounding-54321') : day % 3 === 0 ? 'mental-grounding' : 'pacer';
  const before = day % 5 === 0 ? 5 : 4;
  const helps = { pmr: 2, pacer: 2, 'grounding-54321': 1, 'mental-grounding': 1 }[technique];
  const trend = day > -8 ? 1 : 0; // the last week is a little better
  const after = Math.max(1, before - helps - trend);
  sessions.push({
    user: demo._id,
    technique,
    before,
    after,
    clientId: `seed-${++n}`,
    occurredAt: at(day, hour),
    localDate: localDay(day),
    localHour: hour,
    timeOfDay: bucketForHour(hour),
  });
}
await Session.insertMany(sessions);

const moods = [3, 2, 3, 3, 4, 2, 3, 4, 4, 3, 2, 3, 4, 4, 3, 4, 5, 4, 3, 4];
const tagSets = [['poor-sleep'], ['work-or-study'], ['work-or-study', 'overwhelmed'], ['rested'], ['connected', 'hopeful'], ['poor-sleep', 'lonely'], []];
await CheckIn.insertMany(
  moods
    .map((mood, i) => ({ user: demo._id, localDate: localDay(i - 20), mood, tags: tagSets[i % tagSets.length] }))
    .filter((_, i) => ![3, 8].includes(i)),
);

const { seal, journalKey } = await journalKeyFor(JOURNAL_PASSPHRASE);
await User.updateOne({ _id: demo._id }, { $set: { journalKey } });
const pages = [
  [-6, 'one-okay-thing', 'Chai with Riya after class. I laughed properly for the first time this week.'],
  [-5, 'what-helped', 'Panic started on the metro. Did the 5-4-3-2-1 standing up and it got me to my stop.'],
  [-3, 'let-go', 'Setting down the presentation. It went fine. It was never going to be the disaster my brain said it was.'],
  [-2, 'tomorrow-small', 'Sleep before midnight. Phone in the other room.'],
  [-1, 'proud', 'Told my friend I was struggling instead of pretending. She got it.'],
];
for (const [day, promptId, text] of pages) {
  await JournalEntry.create({ user: demo._id, kind: 'daily', localDate: localDay(day), promptId, ...(await seal(text)) });
}
await JournalEntry.create({ user: demo._id, kind: 'note', localDate: localDay(-4), ...(await seal('Things that help: cold water on my wrists, the pacer, texting Riya.')) });

const tz = 'Asia/Kolkata';
await Reminder.insertMany([
  { user: demo._id, kind: 'checkin', time: '10:00', days: [0, 1, 2, 3, 4, 5, 6], timezone: tz },
  { user: demo._id, kind: 'journal', time: '21:30', days: [0, 1, 2, 3, 4, 5, 6], timezone: tz },
]);

// ---------- community: threads, reactions, and things to moderate ----------
async function post(author, text, hoursAgo) {
  const _id = new mongoose.Types.ObjectId();
  const { crisis, flags, hold } = analyseText(text);
  return Post.create({
    _id,
    author: author._id,
    handle: threadHandle(author._id, _id),
    text,
    status: hold ? 'held' : 'visible',
    flags,
    crisis,
    needsReview: hold || crisis,
    createdAt: new Date(Date.now() - hoursAgo * 3_600_000),
  });
}
async function reply(p, author, text, parent = null) {
  const parentReply = parent ? p.replies.id(parent) : null;
  const { crisis, flags, hold } = analyseText(text);
  const r = {
    _id: new mongoose.Types.ObjectId(),
    author: author._id,
    handle: threadHandle(author._id, p._id),
    text,
    parent: parentReply?._id ?? null,
    depth: parentReply ? Math.min(3, parentReply.depth + 1) : 1,
    status: hold ? 'held' : 'visible',
    flags,
    crisis,
    needsReview: hold || crisis,
  };
  p.replies.push(r);
  await p.save();
  return r._id;
}
async function react(p, user, type, replyId = null) {
  await Reaction.create({ user: user._id, post: p._id, reply: replyId, type });
  const path = replyId ? 'replies.$[r].reactions.' + type : `reactions.${type}`;
  await Post.updateOne({ _id: p._id }, { $inc: { [path]: 1 } }, replyId ? { arrayFilters: [{ 'r._id': replyId }] } : {});
}

const p1 = await post(demo2, 'First panic attack in months, on the metro of all places. Heart racing, hands numb. It passed but I feel shaky.', 5);
const r1 = await reply(p1, demo3, 'That sounds really scary, and you got through it. The shaky feeling afterwards is normal for me too.');
const r2 = await reply(p1, demo2, 'Thank you, it helps to hear that it is normal.', r1);
await reply(p1, demo, 'Metro ones are the worst. Counting stations helped me once. You did well.', r2);
await react(p1, demo3, 'support');
await react(p1, demo, 'support');
await react(p1, demo, 'same');
await react(p1, demo2, 'hug', r1);

const p2 = await post(demo3, 'Exams next week and I cannot stop the racing thoughts at night. Anyone have something that helps them sleep?', 3);
const r3 = await reply(p2, demo, 'Muscle relaxation before bed has honestly changed my nights. Feet first, all the way up.');
await reply(p2, demo3, 'Trying it tonight!', r3);
await react(p2, demo3, 'strength', r3);
await react(p2, demo, 'same');

const p3 = await post(demo, 'Small win: used the pacer during a meeting with my camera off and nobody noticed. Felt good to handle it.', 1);
await react(p3, demo2, 'strength');
await react(p3, demo3, 'strength');
await react(p3, demo3, 'support');

// For the moderation demo: a held post, a reported reply and a crisis post.
await post(demo2, 'Anyone want to talk privately? Message me on 98765 43210', 0.6);
const r4 = await reply(p2, demo2, 'Just stop overthinking, it is not that deep');
await Report.create({ reporter: demo3._id, post: p2._id, reply: r4, reason: 'unkind' });
await Post.updateOne({ _id: p2._id, 'replies._id': r4 }, { $set: { 'replies.$.needsReview': true, 'replies.$.reportCount': 1 } });
await post(demo3, 'Some nights I feel like I cant go on like this.', 0.3);

console.log(`Demo data ready.
  demo1@luma.test / ${PASSWORD}  (journal passphrase: ${JOURNAL_PASSPHRASE})
  moderator@luma.test / ${PASSWORD}  (3 items in the review queue)`);
await mongoose.disconnect();
