import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useJoinChannel } from "./useJoinChannel";

const { getJoinChannel } = vi.hoisted(() => ({ getJoinChannel: vi.fn() }));

vi.mock("@/lib/api/config", () => ({ configAPI: { getJoinChannel } }));

const SCUBABOARD = { slug: "scubaboard", label: "ScubaBoard" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useJoinChannel", () => {
  it("is known at once, and asks nothing, without a via", () => {
    const { result } = renderHook(() => useJoinChannel(null));

    expect(result.current).toEqual({ channel: null, isLoading: false });
    expect(getJoinChannel).not.toHaveBeenCalled();
  });

  it("is loading until the API answers, then hands back the channel", async () => {
    getJoinChannel.mockResolvedValue(SCUBABOARD);

    const { result } = renderHook(() => useJoinChannel("scubaboard"));

    expect(result.current).toEqual({ channel: null, isLoading: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.channel).toEqual(SCUBABOARD);
    expect(getJoinChannel).toHaveBeenCalledWith("scubaboard");
  });

  // Every failure reads as "no channel": the page's answer is the ordinary landing
  // page for a dead link and an unreachable API alike.
  it("reads a failed request as no channel", async () => {
    getJoinChannel.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useJoinChannel("scubaboard"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.channel).toBeNull();
  });

  // A client-side navigation between two join links keeps this mounted. The
  // second slug is loading until its own answer lands, rather than wearing the
  // first one's label in the meantime.
  it("never shows one slug's answer for another", async () => {
    getJoinChannel.mockResolvedValueOnce(SCUBABOARD);
    let answer!: (channel: unknown) => void;
    getJoinChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const { result, rerender } = renderHook(({ via }) => useJoinChannel(via), {
      initialProps: { via: "scubaboard" },
    });
    await waitFor(() => expect(result.current.channel).toEqual(SCUBABOARD));

    rerender({ via: "reddit" });
    expect(result.current).toEqual({ channel: null, isLoading: true });

    answer({ slug: "reddit", label: "Reddit" });
    await waitFor(() =>
      expect(result.current.channel).toEqual({
        slug: "reddit",
        label: "Reddit",
      }),
    );
  });
});
