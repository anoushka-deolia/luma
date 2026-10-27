import mongoose from 'mongoose';

const journalKeySchema = new mongoose.Schema(
  {
    // Salt for PBKDF2 and a small encrypted known value used to check the
    // passphrase on the device. None of these reveal the passphrase or entries.
    salt: { type: String, required: true },
    verifierCiphertext: { type: String, required: true },
    verifierIv: { type: String, required: true },
  },
  { _id: false },
);

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['member', 'moderator'], default: 'member' },
    journalKey: { type: journalKeySchema, default: null },
    guidelinesAcceptedAt: { type: Date, default: null },
    // Community safety: set by moderators.
    mutedUntil: { type: Date, default: null },
    warnings: { type: Number, default: 0 },
    pushSubscriptions: { type: [pushSubscriptionSchema], default: [], select: false },
  },
  { timestamps: true },
);

userSchema.methods.isMuted = function isMuted(now = new Date()) {
  return Boolean(this.mutedUntil && this.mutedUntil > now);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    hasJournal: Boolean(this.journalKey),
    guidelinesAccepted: Boolean(this.guidelinesAcceptedAt),
    mutedUntil: this.isMuted() ? this.mutedUntil : null,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
