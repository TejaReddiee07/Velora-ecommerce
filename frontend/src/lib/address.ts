// UK-only delivery rules for instant feedback in forms.
// The API enforces the same rules (backend/src/utils/address.ts) — keep them in step.

export const DELIVERY_COUNTRY_OPTIONS = [{ value: 'GB', label: 'United Kingdom' }];
export const UK_ONLY_NOTE = 'We deliver to addresses in the United Kingdom only (England, Scotland, Wales and Northern Ireland).';
export const POSTCODE_MESSAGE = 'Enter a valid UK postcode, for example SW1A 1AA.';
const CROWN_MESSAGE = 'Sorry, we only deliver to the UK mainland and Northern Ireland, not the Channel Islands or the Isle of Man.';

const OUTWARD = '(?:[A-PR-UWYZ][0-9]{1,2}|[A-PR-UWYZ][A-HK-Y][0-9]{1,2}|[A-PR-UWYZ][0-9][A-HJKPSTUW]|[A-PR-UWYZ][A-HK-Y][0-9][ABEHMNPRVWXY])';
const INWARD = '[0-9][ABD-HJLNP-UW-Z]{2}';
const UK_POSTCODE = new RegExp(`^(?:${OUTWARD}${INWARD}|GIR0AA)$`);

/** "sw1a1aa" → "SW1A 1AA"; null when it is not a UK postcode. */
export function normalizeUkPostcode(raw: string | null | undefined): string | null {
  const compact = String(raw ?? '').toUpperCase().replace(/[\s-]+/g, '');
  if (!UK_POSTCODE.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/** Error message for a postcode field, or undefined when it is fine. */
export function postcodeError(raw: string): string | undefined {
  if (!raw.trim()) return 'Enter your postcode.';
  const pc = normalizeUkPostcode(raw);
  if (!pc) return POSTCODE_MESSAGE;
  if (/^(GY|JE|IM)[0-9]/.test(pc)) return CROWN_MESSAGE;
  return undefined;
}
