import mongoose from 'mongoose';

// Only ciphertext is ever stored. Entries are encrypted with AES-GCM on the
// device using a key derived from a passphrase the server never sees.
// "daily" entries are the one-page-a-day journal (one per local date, editable);
// "note" entries are free notes written any time.
const journalEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['note', 'daily'], default: 'note' },
    localDate: { type: String },
    // Which of the app's built-in prompts was shown. The prompt text is public;
    // the answer is in the ciphertext.
    promptId: { type: String, maxlength: 40 },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
  },
  { timestamps: true },
);

journalEntrySchema.index(
  { user: 1, localDate: 1 },
  { unique: true, partialFilterExpression: { kind: 'daily' } },
);

export const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);
