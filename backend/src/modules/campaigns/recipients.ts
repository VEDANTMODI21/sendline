/** Pragmatic address check: one @, no spaces, a dotted domain with a 2+ letter TLD. */
const ADDRESS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/;

export interface CleanRecipients {
  valid: string[];
  invalid: string[];
  duplicates: number;
}

/** Lower-cases, trims, validates and de-duplicates while keeping upload order. */
export function cleanRecipients(input: string[]): CleanRecipients {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const raw of input) {
    const v = raw.trim().replace(/^mailto:/i, '').replace(/^<|>$/g, '').toLowerCase();
    if (!v) continue;
    if (v.length > 254 || !ADDRESS.test(v)) {
      invalid.push(raw.trim());
      continue;
    }
    if (seen.has(v)) {
      duplicates++;
      continue;
    }
    seen.add(v);
    valid.push(v);
  }
  return { valid, invalid, duplicates };
}
