import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useJoinVia } from "./useJoinVia";

const { getJoinChannel, getInviteLink } = vi.hoisted(() => ({
  getJoinChannel: vi.fn(),
  getInviteLink: vi.fn(),
}));

vi.mock("@/lib/api/config", () => ({
  configAPI: { getJoinChannel, getInviteLink },
}));

const SCUBABOARD = { slug: "scubaboard", label: "ScubaBoard" };
const TOKEN = "0123456789abcdef0123456789abcdef";
const LINK = { token: TOKEN, inviterName: "Sam Diver" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getInviteLink.mockResolvedValue(null);
});

describe("useJoinVia", () => {
  it("is known at once, and asks nothing, without a via", () => {
    const { result } = renderHook(() => useJoinVia(null));

    expect(result.current).toEqual({
      inviteLink: null,
      channel: null,
      isLoading: false,
    });
    expect(getInviteLink).not.toHaveBeenCalled();
    expect(getJoinChannel).not.toHaveBeenCalled();
  });

  it("is loading until the API answers, then hands back the channel", async () => {
    getJoinChannel.mockResolvedValue(SCUBABOARD);

    const { result } = renderHook(() => useJoinVia("scubaboard"));

    expect(result.current).toEqual({
      inviteLink: null,
      channel: null,
      isLoading: true,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.channel).toEqual(SCUBABOARD);
    expect(getJoinChannel).toHaveBeenCalledWith("scubaboard");
  });

  // The link resolver is `no-store`; the channel one is publicly cacheable. A live
  // token must never reach the second.
  it("asks for an invite link first, and never sends a live one to the channel route", async () => {
    getInviteLink.mockResolvedValue(LINK);

    const { result } = renderHook(() => useJoinVia(TOKEN));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({
      inviteLink: LINK,
      channel: null,
      isLoading: false,
    });
    expect(getInviteLink).toHaveBeenCalledWith(TOKEN);
    expect(getJoinChannel).not.toHaveBeenCalled();
  });

  it("asks the channel route only once the link route has said no", async () => {
    getJoinChannel.mockResolvedValue(SCUBABOARD);

    const { result } = renderHook(() => useJoinVia("scubaboard"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getInviteLink).toHaveBeenCalledWith("scubaboard");
    expect(
      getInviteLink.mock.invocationCallOrder[0] <
        getJoinChannel.mock.invocationCallOrder[0],
    ).toBe(true);
  });

  // Every failure reads as "nothing": the page's answer is the ordinary landing
  // page for a dead link and an unreachable API alike.
  it("reads a failed channel request as no channel", async () => {
    getJoinChannel.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useJoinVia("scubaboard"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.channel).toBeNull();
    expect(result.current.inviteLink).toBeNull();
  });

  // The token may have been live, so a failed link request does not fall through
  // to the publicly cacheable route.
  it("reads a failed link request as nothing, without asking the channel route", async () => {
    getInviteLink.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useJoinVia(TOKEN));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({
      inviteLink: null,
      channel: null,
      isLoading: false,
    });
    expect(getJoinChannel).not.toHaveBeenCalled();
  });

  // A client-side navigation between two join links keeps this mounted. The
  // second slug is loading until its own answer lands, rather than wearing the
  // first one's label in the meantime.
  it("never shows one value's answer for another", async () => {
    getJoinChannel.mockResolvedValueOnce(SCUBABOARD);
    let answer!: (channel: unknown) => void;
    getJoinChannel.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const { result, rerender } = renderHook(({ via }) => useJoinVia(via), {
      initialProps: { via: "scubaboard" },
    });
    await waitFor(() => expect(result.current.channel).toEqual(SCUBABOARD));

    rerender({ via: "reddit" });
    expect(result.current).toEqual({
      inviteLink: null,
      channel: null,
      isLoading: true,
    });

    answer({ slug: "reddit", label: "Reddit" });
    await waitFor(() =>
      expect(result.current.channel).toEqual({
        slug: "reddit",
        label: "Reddit",
      }),
    );
  });
});
