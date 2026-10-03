import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CardMapPicture } from "./card-map-picture";

// What a card's map does over time: water until its picture arrives, the
// picture faded in once and shown at once after that, the last picture held
// through a theme switch, its request let go when the card unmounts, and
// nothing asked again but by mounting again. Where the picture lands is a
// layout question, and `card-frames.browser.test.tsx` answers it.

const theme = vi.hoisted(() => ({ resolved: "light" as string | undefined }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: theme.resolved }),
}));

const { getMapPicture } = vi.hoisted(() => ({ getMapPicture: vi.fn() }));
vi.mock("@/lib/api/map-pictures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/map-pictures")>()),
  mapPicturesAPI: { getMapPicture },
}));

// Each request answered by hand, with the signal it was handed.
let requests: {
  url: string;
  signal: AbortSignal;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
}[] = [];

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  theme.resolved = "light";
  requests = [];
  let created = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++created}`);
  URL.revokeObjectURL = vi.fn();
  getMapPicture.mockReset();
  // Rejecting on an abort, as axios does: the page's two slots are freed by
  // the rejection, and a test leaving one held would starve the next.
  getMapPicture.mockImplementation(
    (url: string, signal: AbortSignal) =>
      new Promise<Blob>((resolve, reject) => {
        requests.push({ url, signal, resolve, reject });
        signal.addEventListener("abort", () =>
          reject(new DOMException("canceled", "AbortError")),
        );
      }),
  );
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.useRealTimers();
});

// The page's cache outlives a test, so each test pictures a record of its own.
const picture = (uuid: string, digest: string | null = `digest-${uuid}`) => (
  <ul>
    <li className="relative">
      <CardMapPicture
        kind="dive"
        uuid={uuid}
        digest={digest}
        label="Map of Blue Hole"
        coveredBottom={80}
        water={<div data-testid="water" />}
      />
    </li>
  </ul>
);

const answer = async (index: number, blob = new Blob(["webp"])) => {
  await act(async () => requests[index].resolve(blob));
};

const shownPicture = () =>
  screen.queryByRole("img", { name: "Map of Blue Hole" })?.querySelector("img");

describe("CardMapPicture", () => {
  it("shows water while its picture is drawn, then fades the picture in over it", async () => {
    render(picture("arrives"));

    expect(screen.getByTestId("water")).toBeInTheDocument();
    expect(shownPicture()).toBeUndefined();
    expect(requests.map(({ url }) => url)).toEqual([
      "/dive/arrives/map-picture?theme=light&v=digest-arrives",
    ]);

    await answer(0);

    expect(shownPicture()).toHaveAttribute("src", "blob:1");
    expect(shownPicture()).toHaveClass("fade-in");
    // Under the picture as it fades, so it fades in from the water.
    expect(screen.getByTestId("water")).toBeInTheDocument();
  });

  it("shows a picture the page already has at once, and asks for nothing", async () => {
    const { unmount } = render(picture("kept"));
    await answer(0);
    unmount();

    render(picture("kept"));

    expect(shownPicture()).toHaveAttribute("src", "blob:1");
    expect(shownPicture()).not.toHaveClass("fade-in");
    expect(screen.queryByTestId("water")).not.toBeInTheDocument();
    expect(getMapPicture).toHaveBeenCalledOnce();
  });

  it("holds the last picture through a theme switch until the other arrives", async () => {
    const { rerender } = render(picture("switched"));
    await answer(0);

    theme.resolved = "dark";
    rerender(picture("switched"));

    expect(requests[1].url).toBe(
      "/dive/switched/map-picture?theme=dark&v=digest-switched",
    );
    expect(shownPicture()).toHaveAttribute("src", "blob:1");

    await answer(1);

    expect(shownPicture()).toHaveAttribute("src", "blob:2");
    // From one picture to the other, with no water to fade in from.
    expect(shownPicture()).not.toHaveClass("fade-in");
  });

  it("lets its request go when the card unmounts", () => {
    const { unmount } = render(picture("left"));

    unmount();

    expect(requests[0].signal.aborted).toBe(true);
  });

  it("asks for nothing until the page's theme is known", () => {
    theme.resolved = undefined;
    render(picture("untimed"));

    expect(getMapPicture).not.toHaveBeenCalled();
    expect(screen.getByTestId("water")).toBeInTheDocument();
  });

  it("asks for nothing where the record names no picture", () => {
    render(picture("unnamed", null));

    expect(getMapPicture).not.toHaveBeenCalled();
    expect(screen.getByTestId("water")).toBeInTheDocument();
  });

  // A failure is a renderer down or busy, and every card on every open page
  // asking again on a schedule would add to it.
  it("shows water where its picture cannot be had, and asks again only on a mount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(picture("failed"));
    await act(async () =>
      requests[0].reject(
        Object.assign(new Error("Service Unavailable"), {
          response: { status: 503 },
        }),
      ),
    );

    expect(screen.getByTestId("water")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(10 * 60_000));
    expect(getMapPicture).toHaveBeenCalledOnce();

    unmount();
    render(picture("failed"));
    expect(getMapPicture).toHaveBeenCalledTimes(2);
  });
});
