/**
 * A file name part for a download: ASCII letters and digits joined by `_`.
 * Company names and plates go into a Content-Disposition header, where a
 * quote or a line break would be an injection, and diacritics would need
 * RFC 5987 encoding that some browsers still get wrong — "Șerban" becomes
 * "Serban".
 */
export function asciiSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
