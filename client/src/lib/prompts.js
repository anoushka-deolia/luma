// Daily journal prompts. Gentle, concrete, and answerable on a bad day too.
// The id is stored with the page (the prompt itself is not private).
export const PROMPTS = [
  { id: 'one-okay-thing', text: 'What is one thing that felt okay today, even a small one?' },
  { id: 'body-now', text: 'How does your body feel right now, from head to toe?' },
  { id: 'what-helped', text: 'When things felt hard today, what helped, even a little?' },
  { id: 'kind-to-self', text: 'What would you say to a friend who had the day you had?' },
  { id: 'noticed', text: 'What is something you noticed today that you usually miss?' },
  { id: 'worry-size', text: 'What is on your mind? How big does it feel, from 1 to 10?' },
  { id: 'proud', text: 'What did you do today that took some courage?' },
  { id: 'let-go', text: 'Is there something from today you would like to set down before sleeping?' },
  { id: 'tomorrow-small', text: 'What is one small thing you could do for yourself tomorrow?' },
  { id: 'people', text: 'Who did you feel most at ease with today, and why?' },
  { id: 'energy', text: 'What gave you energy today, and what drained it?' },
  { id: 'sensory', text: 'Name a sound, a smell or a texture from today that you liked.' },
  { id: 'trigger', text: 'Did anything make you anxious today? What was happening just before?' },
  { id: 'enough', text: 'What did you get done today that counts, even if it feels small?' },
  { id: 'comfort', text: 'What is something that comforts you that you could reach for more often?' },
  { id: 'thought-check', text: 'Write down a worrying thought. What would a calmer you say back to it?' },
  { id: 'grateful-three', text: 'Three things, big or tiny, you are glad were part of today.' },
  { id: 'rest', text: 'When did you rest today? If you did not, when could you tomorrow?' },
  { id: 'free-write', text: 'Write whatever is here. No prompt, no rules.' },
  { id: 'future-self', text: 'What do you hope you will remember about this week?' },
  { id: 'boundary', text: 'Was there a moment today you wanted to say no? What happened?' },
  { id: 'safe-place', text: 'Describe a place where you feel safe, in as much detail as you like.' },
];

export const promptById = (id) => PROMPTS.find((p) => p.id === id) ?? null;

/** The same prompt all day, a different one each day. */
export function promptIndexForDate(dateStr) {
  let hash = 0;
  for (const ch of dateStr) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % PROMPTS.length;
}
