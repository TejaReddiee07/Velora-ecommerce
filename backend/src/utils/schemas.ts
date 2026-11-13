import { z } from 'zod';
import { COUNTRY_MESSAGE, DELIVERY_COUNTRIES, deliveryProblem, normalizeUkPostcode } from './address.js';

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId });

export const csv = (max = 20) =>
  z
    .string()
    .max(500)
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, max)
        : undefined,
    );

export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === 'true' || v === '1'));

export const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
};

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number');

export const addressInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().max(100).optional(),
  // UK delivery only: the postcode must be a real UK postcode format (stored as "SW1A 1AA").
  postalCode: z
    .string()
    .trim()
    .max(20)
    .transform((v, ctx) => {
      const problem = deliveryProblem({ country: DELIVERY_COUNTRIES[0], postalCode: v });
      if (problem) {
        ctx.addIssue({ code: 'custom', message: problem.message });
        return z.NEVER;
      }
      return normalizeUkPostcode(v)!;
    }),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => (DELIVERY_COUNTRIES as readonly string[]).includes(c), COUNTRY_MESSAGE),
});
