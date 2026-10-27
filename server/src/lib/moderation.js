// Automatic checks run on every post and reply before it is saved.
//
// Two different outcomes:
// - "crisis": the writer may be in danger. The post stays visible (being heard
//   matters), the writer is shown helplines straight away, and the post goes to
//   the top of the moderators' queue.
// - "hold" flags: likely to hurt others or the writer (abuse, contact details,
//   links, spam, descriptions of self-harm methods). The post is held: only the
//   writer sees it, until a moderator approves it.
//
// This is a first line of defence, not a judgement. Every decision a word list
// makes can be overturned by a moderator.

const normalise = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/\$/g, 's')
    .replace(/[^a-z\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CRISIS_PATTERNS = [
  /\bkill(ing)? my ?self\b/,
  /\bend(ing)? (my|it) (life|all)\b/,
  /\bsuicid(e|al)\b/,
  /\b(want|wanna|going) to die\b/,
  /\bdon'?t want to (be alive|live|exist|wake up)\b/,
  /\bno (reason|point) (to|in) (live|living|going on)\b/,
  /\bbetter off (dead|without me)\b/,
  /\b(hurt|harm|cut|cutting) my ?self\b/,
  /\bself ?harm(ing)?\b/,
  /\bcan'?t go on\b/,
];

// Aimed at another person. Kept short and specific to avoid flagging people
// describing their own feelings ("I feel so stupid").
const ABUSE_PATTERNS = [
  /\bkill your ?self\b/,
  /\bkys\b/,
  /\bgo die\b/,
  /\byou('?re| are) (so )?(pathetic|worthless|a loser|an idiot|stupid|disgusting|a joke)\b/,
  /\bnobody (cares|likes you)\b/,
  /\bshut up\b/,
  /\battention seek(er|ing)\b/,
  /\bjust get over it\b/,
];

// Describing how to self-harm can harm readers.
const METHOD_PATTERNS = [
  /\bhow (many|much) (pills|tablets)\b/,
  /\b(overdose|od) on\b/,
  /\b(best|easiest|painless) way to (die|kill)\b/,
  /\bhow to (cut|hang|overdose)\b/,
];

const PHONE = /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|in|net|org|io|me|xyz|app)\b/i;
const HANDLE = /(?:^|\s)@[a-z0-9_.]{3,}/i;
const REPEATED = /(.)\1{9,}/;

export function analyseText(text) {
  const plain = normalise(text);
  const flags = new Set();

  const crisis = CRISIS_PATTERNS.some((p) => p.test(plain));
  if (ABUSE_PATTERNS.some((p) => p.test(plain))) flags.add('abuse');
  if (METHOD_PATTERNS.some((p) => p.test(plain))) flags.add('method');
  if (PHONE.test(text) || EMAIL.test(text) || HANDLE.test(text)) flags.add('contact-info');
  if (LINK.test(text)) flags.add('link');
  if (REPEATED.test(text) || (text.length > 40 && text === text.toUpperCase() && /[A-Z]/.test(text))) {
    flags.add('spam');
  }

  return { crisis, flags: [...flags], hold: flags.size > 0 };
}

export const FLAG_LABELS = {
  abuse: 'Unkind or abusive language',
  method: 'Describes self-harm methods',
  'contact-info': 'Shares contact details',
  link: 'Contains a link',
  spam: 'Looks like spam',
  duplicate: 'Same text posted repeatedly',
};

export const HELD_MESSAGE =
  'Thanks for posting. A moderator will look at it shortly, because it may contain contact details, links or language that could hurt someone.';
