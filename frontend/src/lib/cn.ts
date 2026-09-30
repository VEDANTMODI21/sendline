/** className joiner that drops falsy parts. */
export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
