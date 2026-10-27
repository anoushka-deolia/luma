// Display info for the four MVP techniques. Ids match the server.
export const TECHNIQUES = {
  pacer: {
    id: 'pacer',
    name: 'Breathing pacer',
    short: 'Tap along with your breath, then follow it as it slows.',
    path: '/calm/pacer',
  },
  'grounding-54321': {
    id: 'grounding-54321',
    name: '5-4-3-2-1 grounding',
    short: 'Notice what you can see, feel, hear, smell and taste.',
    path: '/calm/grounding-54321',
  },
  pmr: {
    id: 'pmr',
    name: 'Muscle relaxation',
    short: 'Tense and release one part of your body at a time.',
    path: '/calm/pmr',
  },
  'mental-grounding': {
    id: 'mental-grounding',
    name: 'Mental grounding',
    short: 'Simple thinking games that pull focus away from the panic.',
    path: '/calm/mental-grounding',
  },
};

export const DEFAULT_ORDER = ['pacer', 'grounding-54321', 'pmr', 'mental-grounding'];

export const techniqueName = (id) => TECHNIQUES[id]?.name ?? id;

export const ONBOARDING_QUESTIONS = [
  {
    key: 'feelings',
    title: 'What do your hard moments usually feel like?',
    hint: 'Pick any that fit.',
    options: [
      { value: 'racing-thoughts', label: 'Racing thoughts' },
      { value: 'body-sensations', label: 'Strong body sensations (heart, chest, shaking)' },
      { value: 'numb-detached', label: 'Feeling numb, unreal or far away' },
    ],
  },
  {
    key: 'helped',
    title: 'What has helped before?',
    hint: 'Pick any that fit, or none.',
    options: [
      { value: 'breathing', label: 'Slowing my breathing' },
      { value: 'noticing-surroundings', label: 'Noticing what is around me' },
      { value: 'moving-body', label: 'Moving or tensing my body' },
      { value: 'distraction', label: 'Giving my mind a task' },
    ],
  },
  {
    key: 'worse',
    title: 'Does anything tend to make it worse?',
    hint: 'This matters: some techniques backfire for some people.',
    options: [
      { value: 'focusing-on-breath', label: 'Focusing on my breathing' },
      { value: 'focusing-on-body', label: 'Paying attention to my body' },
      { value: 'thinking-tasks', label: 'Having to think hard' },
      { value: 'sensory-attention', label: 'Paying close attention to my surroundings' },
    ],
  },
  {
    key: 'preferences',
    title: 'What kind of help do you prefer?',
    hint: 'Pick any that fit.',
    options: [
      { value: 'visual', label: 'Something to watch' },
      { value: 'audio', label: 'Something to listen to' },
      { value: 'movement', label: 'Something to do with my body' },
      { value: 'touch', label: 'Something to tap or touch' },
    ],
  },
];
