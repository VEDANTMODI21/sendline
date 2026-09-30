/**
 * Pulls email addresses out of anything a user might upload: a one-column list, a CSV with a
 * header row and several columns, quoted fields, semicolon/tab separated exports, or "Name <addr>".
 * Scanning tokens (instead of assuming a column) means we never need to ask which column holds emails.
 */
const CANDIDATE = /[^\s,;"'<>()[\]]+@[^\s,;"'<>()[\]]+/g;
const VALID = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/;

export interface ParsedList {
  valid: string[];
  invalid: string[];
  duplicates: number;
}

export function extractAddresses(text: string): ParsedList {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const m of text.matchAll(CANDIDATE)) {
    const v = m[0].replace(/^mailto:/i, '').replace(/[.,;:]+$/, '').toLowerCase();
    if (!VALID.test(v)) {
      invalid.push(m[0]);
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

export const isAddress = (s: string) => VALID.test(s.trim().toLowerCase());
