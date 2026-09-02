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
//
// The export archive is the one blob that is *not* bounded by an upload limit - it is
// as big as the account is. It still only needs the URL to survive the start of the
// read, so the delay is unchanged; what it costs is the blob staying resident for a
// minute after saving. See DECISIONS.md on the export card for the memory trade.
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

// Pulls the filename out of a `Content-Disposition` header, or returns null when the
// header is missing, unparseable, or names nothing usable.
//
// **On a split-origin deployment this returns null far more often than the header being
// present suggests.** `Content-Disposition` is not one of the seven CORS-safelisted
// response headers, so unless the server sends `Access-Control-Expose-Headers` the
// browser hands JS `null` for a header that is plainly there in the network tab - and
// local dev is exactly that shape (`localhost:3000` -> `localhost:8000`). A deployed
// instance is same-origin behind `app/api/v1/[...path]/route.ts`, where CORS never
// applies and the header arrives intact. Every caller still needs its own fallback name:
// parsing is the improvement, not the mechanism.
//
// Both RFC 6266 forms are handled. A **UTF-8** `filename*=UTF-8''...` wins where
// present, because that is the one that can carry non-ASCII, and a server sending both
// sends the plain `filename=` as the lossy fallback for clients that cannot read the
// other.
//
// The charset is checked rather than assumed. `decodeURIComponent` only speaks UTF-8, so
// an `ISO-8859-1''caf%E9.zip` is not something this can decode - `%E9` is not valid
// UTF-8 and the call throws. Falling through to the plain `filename=` is the right
// answer either way, but it should be the answer this function *chose* rather than one
// an exception happened to produce.
export function filenameFromContentDisposition(
  header: string | null | undefined,
): string | null {
  if (!header) return null;

  // Groups: charset, language (RFC 8187 allows it to be empty, and nothing here
  // needs it), then the percent-encoded name.
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended && /^(utf-8|us-ascii)?$/i.test(extended[1].trim())) {
    try {
      const safe = basename(decodeURIComponent(extended[2].trim()));
      if (safe) return safe;
    } catch {
      // A malformed percent-escape. Fall through to the plain `filename=` below
      // rather than throwing: a wrong-but-present name beats failing the download.
    }
  }

  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  if (plain) {
    const safe = basename((plain[2] ?? plain[1]).trim());
    if (safe) return safe;
  }

  return null;
}

// Strips any directory part a header might carry. `link.download` already refuses to
// write outside the downloads directory, so this is not the last line of defence - but
// a server-supplied string ends up in a filesystem path, and stripping separators here
// costs a line.
function basename(value: string): string {
  return value.split(/[/\\]/).pop()?.trim() ?? "";
}
