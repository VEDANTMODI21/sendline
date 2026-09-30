const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "Tue 9:15:12 AM" — the pill format used in the mailbox list. */
export function pillTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  if (sameDay(d, now)) return `Today ${time}`;
  const diffDays = Math.abs(d.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < 6) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

/** "Nov 3, 10:23 AM" — header date in the detail view. */
export function longTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relative(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat([], { numeric: 'auto' });
  if (abs < 60_000) return fmt.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return fmt.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return fmt.format(Math.round(diff / 3_600_000), 'hour');
  return fmt.format(Math.round(diff / 86_400_000), 'day');
}

/** "john.smith@acme.io" → "John Smith" for the "To:" column. */
export function nameFromAddress(email: string) {
  const local = email.split('@')[0] ?? email;
  const words = local.split(/[._+-]+/).filter((w) => w && !/^\d+$/.test(w));
  if (!words.length) return email;
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export const initials = (s: string) =>
  s
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
