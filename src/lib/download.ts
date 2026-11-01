import {
  downloadTicketsAPI,
  ticketedDownloadUrl,
} from "@/lib/api/download-tickets";
import { navigateToDownload } from "@/lib/navigation";

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

// Whether `userAgent` is Firefox for iOS, the one browser that cannot name a blob
// download. Its injected download script runs in an isolated content world, so the
// page cannot detect the behaviour itself - only the browser's own token in the UA.
// In desktop mode, an iPad's default, Firefox sends desktop Safari's UA verbatim, so
// there it cannot be told apart and stays on the blob path.
export function isFirefoxIOS(userAgent: string): boolean {
  return userAgent.includes("FxiOS/");
}

// Saves the file an API download route serves - an export, a dive's source file, a
// certification card's file.
//
// Every one of those routes is owner-only: it wants an `Authorization` header, and a
// plain `<a href>` cannot send one (the access token lives in memory, not in a
// cookie). So `fetchFile` fetches the bytes through the API client and `downloadBlob`
// hands them to the browser.
//
// Except in Firefox for iOS, which swallows every click on an `a[download]`, re-reads
// the URL itself and names the file from that response's `Content-Disposition` or the
// URL's last segment - never from the `download` attribute. A blob response carries no
// `Content-Disposition`, so a blob save comes out named after the object URL's uuid.
// There it mints a ticket for `path` instead and navigates to the route itself, whose
// `Content-Disposition` names the file. The ticket rides in the URL because Firefox
// fetches that URL a second time with none of the page's headers.
//
// `path` is the route under the API base with no query string; it must be the route
// `fetchFile` reads.
export async function saveApiDownload(
  path: string,
  fetchFile: () => Promise<{ blob: Blob; filename: string }>,
): Promise<void> {
  if (isFirefoxIOS(navigator.userAgent)) {
    const { ticket } = await downloadTicketsAPI.create(path);
    navigateToDownload(ticketedDownloadUrl(path, ticket));
    return;
  }

  const { blob, filename } = await fetchFile();
  downloadBlob(blob, filename);
}

// Saves an in-memory blob to the user's downloads, via an object URL and a synthetic
// click. Reached through `saveApiDownload`, which says why the bytes are in memory.
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
