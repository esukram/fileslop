// Validation rules for request headers. Values outside these rules are rejected, never rewritten.

export const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
export const METADATA_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// RFC 9110 media type: type "/" subtype *( OWS ";" OWS parameter ).
const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const QUOTED = '"(?:[\\t \\x21\\x23-\\x5b\\x5d-\\x7e]|\\\\[\\t \\x21-\\x7e])*"';
const MEDIA_TYPE_RE = new RegExp(
  `^${TOKEN}/${TOKEN}([ \\t]*;[ \\t]*${TOKEN}=(${TOKEN}|${QUOTED}))*$`,
);

export const isMediaType = (value: string): boolean =>
  value.length <= 255 && MEDIA_TYPE_RE.test(value);

/** ISO 8601 week of a date in UTC, formatted as `YYYY-WW` with the ISO week-year. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Move to the Thursday of the same week: that day decides the week-year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}
