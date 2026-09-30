import sanitizeHtml from 'sanitize-html';

/** The body comes from a rich-text editor; only formatting tags survive. */
export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'blockquote',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'font', 'a', 'hr', 'pre', 'code', 'sub', 'sup'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      font: ['size', 'color'],
      '*': ['style'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
        'font-size': [/^\d+(?:px|em|rem|%)$/],
        'line-height': [/^[\d.]+(?:px|em|%)?$/],
        'margin-left': [/^\d+px$/],
        'padding-left': [/^\d+px$/],
        color: [/^#[0-9a-f]{3,6}$/i, /^rgb\(\d+,\s*\d+,\s*\d+\)$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  });
}

/** Plain-text alternative part (and the search/preview text). */
export function htmlToText(html: string): string {
  return sanitizeHtml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n'),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
