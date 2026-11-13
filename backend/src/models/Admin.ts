import { Schema, model, type HydratedDocument } from 'mongoose';

export const ADMIN_ROLES = ['owner', 'manager', 'staff'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface IAdmin {
  name: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  status: 'active' | 'disabled';
  failedLogins: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, default: 'staff' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export const Admin = model<IAdmin>('Admin', adminSchema, 'admins');
export type AdminDoc = HydratedDocument<IAdmin>;
