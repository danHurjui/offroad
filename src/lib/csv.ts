/**
 * CSV files (RL-041). The first thing in this repo that writes one, so the
 * rules live here rather than at a call site.
 *
 * - **Formula injection.** A spreadsheet runs a cell that begins `=`, `+`,
 *   `-` or `@` as a formula — a job named `=HYPERLINK(...)` typed by a
 *   mechanic becomes a live link in the accountant's Excel. Such a field
 *   gets a leading `'`, which Excel and LibreOffice read as "this is text"
 *   (OWASP's advice). Tab and carriage return lead the same list, because
 *   some importers strip them and then see the `=`. Leading spaces are
 *   looked through for the same reason.
 * - **Every field is quoted**, and quotes inside are doubled, so a
 *   separator, a quote or a line break in a note can never move a column.
 * - **`;` separates fields.** Romanian decimals use the comma, so a comma-
 *   separated file would split `14.999,50` in two; `;` is also what Excel
 *   expects under Romanian regional settings.
 * - **A UTF-8 byte-order mark** starts the file: without it Excel opens
 *   UTF-8 as the local code page and prints "Ã®" for "î".
 */

export const CSV_SEPARATOR = ';'
const BOM = '\uFEFF'

/** A spreadsheet reads a field starting with one of these as a formula. */
const FORMULA_START = /^[\s]*[=+\-@]|^[\t\r]/

export type CsvValue = string | number | null | undefined

/** One field, escaped and quoted. Numbers should be formatted by the caller (`formatAmount`). */
export function csvField(value: CsvValue): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/** The whole file: the byte-order mark, the header and the rows, CRLF line ends (RFC 4180). */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  const line = (fields: CsvValue[]) => fields.map(csvField).join(CSV_SEPARATOR)
  return BOM + [line(header), ...rows.map(line)].join('\r\n') + '\r\n'
}
