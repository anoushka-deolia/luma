// Makes an existing account a moderator.
// Usage (from server/): npm run make-moderator -- someone@example.com
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { connectDb } from '../src/db.js';
import { User } from '../src/models/User.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-moderator -- someone@example.com');
  process.exit(1);
}
await connectDb(config.mongoUri);
const user = await User.findOneAndUpdate({ email }, { $set: { role: 'moderator' } }, { returnDocument: 'after' });
console.log(user ? `${email} is now a moderator. Log out and back in to see the Moderation tab.` : `No account with the email ${email}. Sign up in the app first.`);
await mongoose.disconnect();
