// A number as a person types it, on whichever keyboard their phone shows.
//
// iOS's decimal keypad types the separator of the device's region, so half of
// Europe gets a comma and no point. A `type="number"` field drops that comma in
// WebKit - "1,5" arrives as 15 - which is why a touch device enters these
// numbers as text, and why the text is read here with either separator.

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/**
 * The number in `text`, written with a point or a comma before its decimals, or
 * `NaN` when it is not one - including when it carries both, which is a
 * thousands separator and a guess this does not make.
 */
export function parseDecimal(text: string): number {
  const trimmed = text.trim();
  if (trimmed.includes(".") && trimmed.includes(",")) return NaN;
  const normalized = trimmed.replace(",", ".");
  return DECIMAL.test(normalized) ? Number(normalized) : NaN;
}

/**
 * What is wrong with `text` as a number between `min` and `max`, in the words a
 * form shows under its field, or `""` when nothing is - an empty box included,
 * which is a required check's business rather than this one's.
 */
export function decimalEntryMessage(
  text: string,
  min?: number,
  max?: number,
): string {
  if (text.trim() === "") return "";
  const value = parseDecimal(text);
  if (Number.isNaN(value)) return "Enter a number.";
  if (min != null && value < min) return `Enter ${min} or more.`;
  if (max != null && value > max) return `Enter ${max} or less.`;
  return "";
}
