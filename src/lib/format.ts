// Formats a byte count for display next to a stored file, or against the
// storage limit.
//
// Rounds a non-empty file up to at least "1 KB" rather than showing "0 KB",
// which reads as "the upload failed" when it didn't. Switches to MB at 1024 KB
// and to GB at 1024 MB, each with one decimal place: dive-computer exports run
// from a few KB to a few MB, and "2458 KB" is harder to scan than "2.4 MB".
//
// The API's storage-limit refusal formats its figures by this same rule, ties
// rounded upward as `Math.round` and `toFixed` round them here, so a limit
// reads "1.0 GB" in the refusal and in the Storage section alike.
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

// A count and its noun: "1 dive", "3 dives". The noun may carry the words that
// agree with it - "other device was" / "other devices were" - and takes an `s`
// unless the plural is given.
export function countNoun(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
