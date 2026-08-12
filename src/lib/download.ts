// How long an object URL is kept alive after the download has been triggered.
//
// Revoking synchronously after `link.click()` - which both download call sites used
// to do - races the browser. Chrome has taken its own reference by the time `click()`
// returns, so it looks fine there; Firefox and Safari start reading the blob
// asynchronously and simply cancel the download when the URL disappears from under
// them. The failure is silent: no error, no file.
//
// A minute is far longer than any download needs to *start* (which is all that
// matters - once the read has begun, revoking is harmless), and these blobs are
// bounded by the API's own 10 MB upload limit, so holding one briefly costs little.
const REVOKE_DELAY_MS = 60_000;

// Saves an in-memory blob to the user's downloads.
//
// This exists because both downloadable resources - certification card files and dive
// source files - are owner-only: the API requires an `Authorization` header, and a
// plain `<a href>` cannot send one (the access token lives in memory, not in a
// cookie). So the bytes are fetched through the API client and handed to the browser
// via an object URL and a synthetic click.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Firefox only dispatches the download for an anchor that is actually in the
  // document; a detached one is silently ignored.
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
