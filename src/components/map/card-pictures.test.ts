import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page's map pictures and the requests for them: at most two out at a
// time, the rest in the order their cards asked, a request let go when its
// last card withdraws, and a bounded cache that revokes what it drops.

type Module = typeof import("./card-pictures");

// A fresh module per test: the cache and the queue are the page's, and a test
// that left a request out would hold a slot in the next one.
let pictures: Module;
beforeEach(async () => {
  vi.resetModules();
  pictures = await import("./card-pictures");
});

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

// A request the test answers by hand, recording the signal it was handed.
function deferred() {
  const calls: {
    signal: AbortSignal;
    resolve: (blob: Blob) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const load = vi.fn(
    (signal: AbortSignal) =>
      new Promise<Blob>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  );
  return { load, calls };
}

const settled = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("card pictures", () => {
  it("keeps two requests out at a time, and starts the rest in the order asked", async () => {
    const { load, calls } = deferred();
    const keys = ["/dive/a", "/dive/b", "/dive/c", "/dive/d"];
    for (const key of keys) {
      pictures.requestCardPicture(
        key,
        (signal) => load(signal),
        () => {},
      );
    }

    expect(load).toHaveBeenCalledTimes(pictures.MAX_PICTURE_REQUESTS);

    calls[1].resolve(new Blob(["b"]));
    await settled();
    expect(load).toHaveBeenCalledTimes(3);
    expect(pictures.findCardPicture("/dive/b")).toBe("blob:1");

    // A failure frees its slot too.
    calls[0].reject(new Error("503"));
    await settled();
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("hands each card the picture, or null where it could not be had", async () => {
    const { load, calls } = deferred();
    const shown = vi.fn();
    const failed = vi.fn();
    pictures.requestCardPicture("/dive/a", load, shown);
    pictures.requestCardPicture("/dive/b", load, failed);

    calls[0].resolve(new Blob(["a"]));
    calls[1].reject(new Error("429"));
    await settled();

    expect(shown).toHaveBeenCalledExactlyOnceWith("blob:1");
    expect(failed).toHaveBeenCalledExactlyOnceWith(null);
    // A failure is not kept, so whoever asks next asks the API again.
    expect(pictures.findCardPicture("/dive/b")).toBeUndefined();
  });

  it("asks once for a picture two cards wait on", async () => {
    const { load, calls } = deferred();
    const first = vi.fn();
    const second = vi.fn();
    pictures.requestCardPicture("/dive/a", load, first);
    pictures.requestCardPicture("/dive/a", load, second);

    expect(load).toHaveBeenCalledOnce();
    calls[0].resolve(new Blob(["a"]));
    await settled();
    expect(first).toHaveBeenCalledWith("blob:1");
    expect(second).toHaveBeenCalledWith("blob:1");
  });

  it("aborts a request out when its last card withdraws, and frees the slot", async () => {
    const { load, calls } = deferred();
    const withdrawFirst = pictures.requestCardPicture("/dive/a", load, vi.fn());
    const withdrawSecond = pictures.requestCardPicture(
      "/dive/a",
      load,
      vi.fn(),
    );
    pictures.requestCardPicture("/dive/b", load, vi.fn());
    pictures.requestCardPicture("/dive/c", load, vi.fn());

    withdrawFirst();
    expect(calls[0].signal.aborted).toBe(false);
    withdrawSecond();
    expect(calls[0].signal.aborted).toBe(true);

    // The aborted request's rejection is what lets the next one start.
    calls[0].reject(new DOMException("aborted", "AbortError"));
    await settled();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("drops a queued request its card withdraws from, never sending it", async () => {
    const { load, calls } = deferred();
    pictures.requestCardPicture("/dive/a", load, vi.fn());
    pictures.requestCardPicture("/dive/b", load, vi.fn());
    const withdraw = pictures.requestCardPicture("/dive/c", load, vi.fn());
    pictures.requestCardPicture("/dive/d", load, vi.fn());

    withdraw();
    calls[0].resolve(new Blob(["a"]));
    await settled();

    expect(load).toHaveBeenCalledTimes(3);
    // The one started in its place is d's: nothing was sent for c.
    calls[2].resolve(new Blob(["d"]));
    await settled();
    expect(pictures.findCardPicture("/dive/d")).toBeDefined();
    expect(pictures.findCardPicture("/dive/c")).toBeUndefined();
  });

  it("keeps a hundred pictures, revoking the oldest past that", async () => {
    const load = () => Promise.resolve(new Blob(["x"]));
    for (let index = 0; index <= 100; index += 1) {
      pictures.requestCardPicture(`/dive/${index}`, load, () => {});
      await settled();
    }

    expect(pictures.findCardPicture("/dive/0")).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:1");
    expect(pictures.findCardPicture("/dive/100")).toBe("blob:101");
  });
});
