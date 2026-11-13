import { Schema, model, type Types } from 'mongoose';

export interface ISession {
  tokenHash: string;
  subjectType: 'user' | 'admin';
  subject: Types.ObjectId;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
  lastSeenAt: Date;
  createdAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    tokenHash: { type: String, required: true, unique: true },
    subjectType: { type: String, enum: ['user', 'admin'], required: true },
    subject: { type: Schema.Types.ObjectId, required: true, index: true },
    expiresAt: { type: Date, required: true },
    userAgent: String,
    ip: String,
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>('Session', sessionSchema);
