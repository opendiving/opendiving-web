// Formats a byte count for display next to a stored file.
//
// Rounds a non-empty file up to at least "1 KB" rather than showing "0 KB",
// which reads as "the upload failed" when it didn't. Switches to MB at 1024 KB
// with one decimal place: dive-computer exports run from a few KB to a few MB,
// and "2458 KB" is harder to scan than "2.4 MB".
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
