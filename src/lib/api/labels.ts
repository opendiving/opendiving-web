/**
 * A stored vocabulary value's display label, tolerating one this build has no
 * label for. The API can grow a member before the web ships its label, so an
 * unknown value renders de-snaked - `semi_closed` as "Semi closed" - rather than
 * blank, or as a slug that reads like a bug. Own keys only, so a value named like
 * an inherited property is treated as unknown rather than read off the prototype.
 */
export function labelOrFallback(
  labels: Readonly<Partial<Record<string, string>>>,
  value: string,
): string {
  const label = Object.prototype.hasOwnProperty.call(labels, value)
    ? labels[value]
    : undefined;
  return (
    label ?? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}
