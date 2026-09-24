import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UserAvatar } from "./user-avatar";

// What only a render reaches here is the fetch contract: an avatar is owner-only, so
// the bytes arrive through the API client rather than from an `<img src>`, and the
// digest has to travel with the request or a replaced picture stays on screen for
// five minutes of browser cache. The initials path matters just as much - it is what
// every failure mode has to land on, since a broken-image glyph in the header is
// worse than no picture at all.

vi.mock("@/lib/api/auth", () => ({
  authAPI: { getPictureBlob: vi.fn() },
}));

const { authAPI } = await import("@/lib/api/auth");
const getPictureBlob = vi.mocked(authAPI.getPictureBlob);

const originalImage = globalThis.Image;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  getPictureBlob.mockReset().mockResolvedValue(new Blob(["png"]));

  URL.createObjectURL = vi.fn(() => "blob:avatar");
  URL.revokeObjectURL = vi.fn();

  // Radix decides between the image and the fallback by constructing its own
  // `window.Image`, pointing it at the src and reading `complete`/`naturalWidth` -
  // both of which jsdom leaves at their unloaded values forever, so without this the
  // `<img>` is never rendered and the "shows the picture" case cannot be observed
  // at all.
  class LoadedImage extends EventTarget {
    complete = false;
    naturalWidth = 0;
    crossOrigin: string | null = null;
    referrerPolicy = "";
    set src(_value: string) {
      this.complete = true;
      this.naturalWidth = 1;
    }
  }
  // @ts-expect-error - minimal stand-in for the DOM Image constructor
  globalThis.Image = LoadedImage;
});

afterEach(() => {
  globalThis.Image = originalImage;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe("UserAvatar", () => {
  it("draws initials and asks for nothing when there is no picture", async () => {
    render(<UserAvatar name="Jane Doe" avatarSha={null} />);

    expect(await screen.findByText("JD")).toBeInTheDocument();
    // The account without a picture must not cost a request per mount - the header
    // mounts this on every page.
    expect(getPictureBlob).not.toHaveBeenCalled();
  });

  it("fetches the picture with its digest and renders it from an object URL", async () => {
    render(<UserAvatar name="Jane Doe" avatarSha="abc123" />);

    // The digest is the version: it becomes `?v=` on the request, which is what
    // gives each replacement a URL the browser has not cached.
    await waitFor(() =>
      expect(getPictureBlob).toHaveBeenCalledWith("avatar", "abc123"),
    );

    const image = await screen.findByAltText("Jane Doe's avatar");
    expect(image).toHaveAttribute("src", "blob:avatar");
  });

  it("refetches when the picture is replaced", async () => {
    const { rerender } = render(
      <UserAvatar name="Jane Doe" avatarSha="abc123" />,
    );
    await waitFor(() =>
      expect(getPictureBlob).toHaveBeenCalledWith("avatar", "abc123"),
    );

    rerender(<UserAvatar name="Jane Doe" avatarSha="def456" />);

    await waitFor(() =>
      expect(getPictureBlob).toHaveBeenCalledWith("avatar", "def456"),
    );
  });

  it("falls back to initials when the fetch fails", async () => {
    getPictureBlob.mockRejectedValue(new Error("nope"));
    render(<UserAvatar name="Jane Doe" avatarSha="abc123" />);

    await waitFor(() => expect(getPictureBlob).toHaveBeenCalled());

    expect(await screen.findByText("JD")).toBeInTheDocument();
    expect(screen.queryByAltText("Jane Doe's avatar")).not.toBeInTheDocument();
  });
});
