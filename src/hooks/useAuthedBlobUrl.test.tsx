import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthedBlobUrl } from "./useAuthedBlobUrl";

// What the two callers - `CertificationCardImage` and `UserAvatar` - lean on that a
// render test cannot see. `user-avatar.render.test.tsx` already covers what the
// component *draws* for each state; these pin the hook's own contract underneath it,
// which is mostly about object URLs: who creates them, and who releases them. A leak
// here is invisible on screen, and the certification card additionally depends on
// getting the raw rejection back rather than a message the hook made up.

// jsdom implements neither, so both are stubs. `createObjectURL` counts up rather
// than returning a constant, which is what lets a replaced source be told apart from
// a stale one still on screen.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let created = 0;

beforeEach(() => {
  created = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++created}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

type Fetcher = (() => Promise<Blob>) | null;

const resolving = (blob: Blob) => vi.fn(() => Promise.resolve(blob));
const rejecting = (reason: unknown) => vi.fn(() => Promise.reject(reason));

/** A fetch the test settles by hand, to control when a response lands. */
function deferred() {
  let settle: (blob: Blob) => void = () => {};
  const promise = new Promise<Blob>((resolve) => {
    settle = resolve;
  });
  return { fetchBlob: vi.fn(() => promise), promise, settle };
}

const renderWith = (fetchBlob: Fetcher) =>
  renderHook(({ source }) => useAuthedBlobUrl(source), {
    initialProps: { source: fetchBlob },
  });

describe("useAuthedBlobUrl", () => {
  it("wraps the fetched bytes in an object URL", async () => {
    const blob = new Blob(["png"]);
    const fetchBlob = resolving(blob);
    const { result } = renderWith(fetchBlob);

    // In flight is the absence of a result, not a flag set in the effect body.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.url).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The whole reason the hook exists: the endpoint wants an `Authorization`
    // header, so the caller's client fetches the bytes and the URL is minted from
    // what came back - never handed to the browser to fetch itself.
    expect(fetchBlob).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(result.current.url).toBe("blob:1");
    expect(result.current.hasError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("asks for nothing when there is nothing to fetch", () => {
    const { result } = renderWith(null);

    // Not loading, specifically: a null source is a settled "there is no file",
    // and reporting it as in-flight would spin the card forever.
    expect(result.current).toEqual({
      url: null,
      isLoading: false,
      hasError: false,
      error: null,
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes the previous URL when the source changes", async () => {
    const first = resolving(new Blob(["front"]));
    const second = resolving(new Blob(["back"]));
    const { result, rerender } = renderWith(first);
    await waitFor(() => expect(result.current.url).toBe("blob:1"));

    rerender({ source: second });

    // Object URLs are held by the document until released, so replacing one without
    // this leaks the whole blob for the life of the page.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
    // And the revoked URL is not handed out again while the next fetch is in
    // flight - it would render as a broken image.
    expect(result.current.url).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.url).toBe("blob:2"));
  });

  it("revokes on unmount", async () => {
    const { result, unmount } = renderWith(resolving(new Blob(["front"])));
    await waitFor(() => expect(result.current.url).toBe("blob:1"));

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("creates no URL for a response that lands after unmount", async () => {
    const { fetchBlob, promise, settle } = deferred();
    const { unmount } = renderWith(fetchBlob);

    unmount();
    await act(async () => {
      settle(new Blob(["late"]));
      await promise;
    });

    // Nothing is left to revoke it, so creating it at all is the leak.
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("ignores a slow response for a source that has already been replaced", async () => {
    const slow = deferred();
    const current = resolving(new Blob(["current"]));
    const { result, rerender } = renderWith(slow.fetchBlob);

    rerender({ source: current });
    await waitFor(() => expect(result.current.url).toBe("blob:1"));

    await act(async () => {
      slow.settle(new Blob(["stale"]));
      await slow.promise;
    });

    // The previous card's response arriving late must not overwrite the one on
    // screen, and must not mint a URL nobody will revoke.
    expect(result.current.url).toBe("blob:1");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("reports the failure rather than a URL, and passes the rejection through untouched", async () => {
    const rejection = {
      response: {
        status: 404,
        data: { detail: "No front image for this certification" },
      },
    };
    const { result } = renderWith(rejecting(rejection));

    await waitFor(() => expect(result.current.hasError).toBe(true));

    expect(result.current.url).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    // The raw error, not a formatted string: the caller runs it through
    // `getApiErrorMessage` to show what the API actually said.
    expect(result.current.error).toBe(rejection);
  });

  it("still reads as a failure when the rejection carries no value", async () => {
    const { result } = renderWith(rejecting(undefined));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // `hasError` is derived from `error` being non-null, so a thrown `undefined`
    // would otherwise settle as a success with no URL.
    expect(result.current.hasError).toBe(true);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.url).toBeNull();
  });

  it("stops reporting a failure once there is nothing to fetch", async () => {
    const { result, rerender } = renderWith(rejecting(new Error("500")));
    await waitFor(() => expect(result.current.hasError).toBe(true));

    rerender({ source: null });

    // The card drops its source to null for a PDF or a removed file; the previous
    // file's error must not follow it there.
    expect(result.current.hasError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("refetches only when the source's identity changes", async () => {
    const fetchBlob = resolving(new Blob(["front"]));
    const { result, rerender } = renderWith(fetchBlob);
    await waitFor(() => expect(result.current.url).toBe("blob:1"));

    rerender({ source: fetchBlob });
    rerender({ source: fetchBlob });

    // Both callers `useCallback` their fetcher and key it on the file's version, so
    // an unrelated re-render must neither refetch nor revoke the URL on screen.
    expect(fetchBlob).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(result.current.url).toBe("blob:1");
  });
});
