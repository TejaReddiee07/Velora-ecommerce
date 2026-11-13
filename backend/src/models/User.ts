import { Schema, model, type Types, type HydratedDocument } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  emailVerified: boolean;
  emailVerifyTokenHash?: string;
  emailVerifyExpires?: Date;
  resetTokenHash?: string;
  resetExpires?: Date;
  status: 'active' | 'suspended';
  marketingOptIn: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    marketingOptIn: { type: Boolean, default: false },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ createdAt: -1 });
userSchema.index({ name: 'text', email: 'text' });

export const User = model<IUser>('User', userSchema);
export type UserDoc = HydratedDocument<IUser>;
export type UserId = Types.ObjectId;
