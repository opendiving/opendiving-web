"use client";

import { useEffect, useState } from "react";

interface UseAuthedBlobUrlResult {
  url: string | null;
  isLoading: boolean;
  hasError: boolean;
  // The rejection itself, so the caller can run it through `getApiErrorMessage`
  // and show what the API actually said ("No front image for this
  // certification") instead of a generic "couldn't load". Kept as the raw error
  // rather than a formatted string so the hook doesn't have to be told a
  // fallback message it has no opinion about.
  error: unknown;
}

/**
 * Fetches a private, authenticated binary resource and exposes it as an object
 * URL usable as an `<img src>` or a download target.
 *
 * This exists because certification card files are owner-only: the API requires
 * an `Authorization` header, and an `<img>` element cannot send one. The access
 * token lives in memory in `lib/api/client.ts` (only the *refresh* token is a
 * cookie), so there is no ambient credential a plain `src` could rely on either.
 * Fetching through the API client and wrapping the response in an object URL is
 * what bridges the two.
 *
 * The URL is revoked whenever it is replaced and on unmount - object URLs are
 * held by the document until explicitly released, so skipping that leaks the
 * whole blob for the lifetime of the page.
 *
 * `fetchBlob` must be stable (`useCallback`'d) or this refetches every render.
 */
export function useAuthedBlobUrl(
  fetchBlob: (() => Promise<Blob>) | null,
): UseAuthedBlobUrlResult {
  // A single "settled" result rather than three flags, so nothing has to be set
  // synchronously in the effect body just to mark the fetch as started -
  // "in flight" is the absence of a result, which is derived below.
  const [result, setResult] = useState<{
    url: string | null;
    error: unknown;
  } | null>(null);

  useEffect(() => {
    if (!fetchBlob) return;

    // Guards against a slow response for a previous card overwriting a newer
    // one's URL (and against settling after unmount).
    let active = true;
    let objectUrl: string | null = null;

    fetchBlob()
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ url: objectUrl, error: null });
      })
      .catch((err: unknown) => {
        if (!active) return;
        // `err ?? new Error(...)` so a thrown `null`/`undefined` still reads as a
        // failure - `hasError` below is derived from this being non-null.
        setResult({
          url: null,
          error: err ?? new Error("Failed to load the file."),
        });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      // Back to "in flight" for whatever source comes next; the URL just revoked
      // must not be handed out again.
      setResult(null);
    };
  }, [fetchBlob]);

  const error = fetchBlob ? (result?.error ?? null) : null;

  return {
    url: fetchBlob ? (result?.url ?? null) : null,
    isLoading: !!fetchBlob && result === null,
    hasError: error !== null,
    error,
  };
}
