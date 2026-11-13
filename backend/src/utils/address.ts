// Delivery area rules. VELORA delivers to the United Kingdom only
// (England, Scotland, Wales and Northern Ireland).
//
// To deliver somewhere else later, change DELIVERY_COUNTRIES and the postcode
// check below — both the account address book and checkout use these rules.

export const DELIVERY_COUNTRIES = ['GB'] as const;
export const DELIVERY_AREA_LABEL = 'the United Kingdom';

// Royal Mail postcode format: outward code (area + district) + inward code (sector + unit).
const OUTWARD = '(?:[A-PR-UWYZ][0-9]{1,2}|[A-PR-UWYZ][A-HK-Y][0-9]{1,2}|[A-PR-UWYZ][0-9][A-HJKPSTUW]|[A-PR-UWYZ][A-HK-Y][0-9][ABEHMNPRVWXY])';
const INWARD = '[0-9][ABD-HJLNP-UW-Z]{2}';
const UK_POSTCODE = new RegExp(`^(?:${OUTWARD}${INWARD}|GIR0AA)$`);

// UK-style postcodes that are not in the UK: Guernsey, Jersey, Isle of Man.
const CROWN_DEPENDENCIES = /^(GY|JE|IM)[0-9]/;

export const POSTCODE_MESSAGE = 'Enter a valid UK postcode, for example SW1A 1AA.';
export const COUNTRY_MESSAGE = `Sorry, we only deliver to addresses in ${DELIVERY_AREA_LABEL}.`;
export const CROWN_MESSAGE = 'Sorry, we only deliver to the UK mainland and Northern Ireland, not the Channel Islands or the Isle of Man.';

/** "sw1a1aa" / " SW1A  1AA " → "SW1A 1AA"; null when it is not a UK postcode. */
export function normalizeUkPostcode(raw: string | null | undefined): string | null {
  const compact = String(raw ?? '').toUpperCase().replace(/[\s-]+/g, '');
  if (!UK_POSTCODE.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/** Why this address can't be delivered to, or null when it can. */
export function deliveryProblem(a: { country?: string | null; postalCode?: string | null }): { field: 'country' | 'postalCode'; message: string } | null {
  const country = String(a.country ?? '').trim().toUpperCase();
  if (!(DELIVERY_COUNTRIES as readonly string[]).includes(country)) return { field: 'country', message: COUNTRY_MESSAGE };
  const postcode = normalizeUkPostcode(a.postalCode);
  if (!postcode) return { field: 'postalCode', message: POSTCODE_MESSAGE };
  if (CROWN_DEPENDENCIES.test(postcode)) return { field: 'postalCode', message: CROWN_MESSAGE };
  return null;
}
