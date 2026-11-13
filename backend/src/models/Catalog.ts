import { Schema, model, type Types } from 'mongoose';
import { DEPARTMENTS, type Department } from './common.js';

export interface ICategory {
  name: string;
  slug: string;
  department: Department;
  description?: string;
  image?: Types.ObjectId;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    department: { type: String, enum: DEPARTMENTS, required: true, index: true },
    description: { type: String, maxlength: 500 },
    image: { type: Schema.Types.ObjectId },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Category = model<ICategory>('Category', categorySchema);

export interface IBrand {
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    description: { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Brand = model<IBrand>('Brand', brandSchema);
