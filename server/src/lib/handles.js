import crypto from 'node:crypto';
import { config } from '../config.js';

const ADJECTIVES = [
  'Quiet', 'Gentle', 'Steady', 'Soft', 'Brave', 'Calm', 'Kind', 'Warm', 'Patient', 'Hopeful',
  'Bright', 'Still', 'Tender', 'Easy', 'Slow', 'Clear', 'Golden', 'Silver', 'Misty', 'Mellow',
  'Little', 'Wandering', 'Sleepy', 'Cosy', 'Velvet', 'Lucky', 'Humble', 'Sunny', 'Dusky', 'Breezy',
];
const NOUNS = [
  'Otter', 'Sparrow', 'Willow', 'River', 'Meadow', 'Fern', 'Lantern', 'Pebble', 'Heron', 'Moth',
  'Maple', 'Harbor', 'Cloud', 'Robin', 'Tide', 'Moss', 'Comet', 'Panda', 'Koala', 'Lotus',
  'Firefly', 'Owl', 'Birch', 'Ember', 'Wren', 'Badger', 'Dune', 'Shell', 'Clover', 'Orchid',
];

/**
 * A handle that stays the same for one person within one thread (so a
 * conversation is easy to follow) but is different in every other thread, so
 * nobody can link posts across threads back to one person.
 */
export function threadHandle(userId, postId) {
  const digest = crypto
    .createHmac('sha256', config.handleSecret)
    .update(`${userId}:${postId}`)
    .digest();
  const adjective = ADJECTIVES[digest[0] % ADJECTIVES.length];
  const noun = NOUNS[digest[1] % NOUNS.length];
  const number = (digest.readUInt16BE(2) % 90) + 10;
  return `${adjective}${noun}${number}`;
}
