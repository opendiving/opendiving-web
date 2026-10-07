import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import {
  CheckinDetailsProvider,
  useCheckinDetails,
  type CheckinDetailsState,
} from "./CheckinDetailsContext";
import type { CheckinDetails } from "@/lib/api/checkin-details";

// The one copy every check-in surface shows: read once, on the first consumer's mount
// and again for another account; replaced by what a save answers; and never put back
// by a read that set out before that save.

const auth = vi.hoisted(() => ({
  user: { uuid: "user-1" } as { uuid: string } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

vi.mock("@/lib/api/checkin-details", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkinDetailsAPI: { get: vi.fn(), update: vi.fn() },
}));

const { checkinDetailsAPI } = await import("@/lib/api/checkin-details");
const get = vi.mocked(checkinDetailsAPI.get);
const update = vi.mocked(checkinDetailsAPI.update);

const object = (email: string | null): CheckinDetails => ({
  email,
  phone: null,
  date_of_birth: null,
  emergency_contacts: [],
  insurance_policies: [],
});

let state: CheckinDetailsState;
function Consumer() {
  state = useCheckinDetails();
  return <p>{state.details ? (state.details.email ?? "none") : "pending"}</p>;
}

beforeEach(() => {
  auth.user = { uuid: "user-1" };
  get.mockReset().mockResolvedValue(object("a@example.org"));
  update.mockReset();
});

describe("CheckinDetailsProvider", () => {
  it("reads nothing until something asks, and then once for every consumer", async () => {
    const { rerender } = render(
      <CheckinDetailsProvider>{null}</CheckinDetailsProvider>,
    );
    expect(get).not.toHaveBeenCalled();

    rerender(
      <CheckinDetailsProvider>
        <Consumer />
        <Consumer />
      </CheckinDetailsProvider>,
    );

    expect(await screen.findAllByText("a@example.org")).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("never shows one account's copy to the next, and reads the next one's", async () => {
    const { rerender } = render(
      <CheckinDetailsProvider>
        <Consumer />
      </CheckinDetailsProvider>,
    );
    await screen.findByText("a@example.org");

    let answer!: (details: CheckinDetails) => void;
    get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    auth.user = { uuid: "user-2" };
    rerender(
      <CheckinDetailsProvider>
        <Consumer />
      </CheckinDetailsProvider>,
    );

    expect(screen.getByText("pending")).toBeInTheDocument();
    await act(async () => answer(object("b@example.org")));
    expect(screen.getByText("b@example.org")).toBeInTheDocument();
  });

  it("replaces the copy with what a save answers, over a read that set out before it", async () => {
    let answer!: (details: CheckinDetails) => void;
    get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    update.mockResolvedValue(object("saved@example.org"));
    render(
      <CheckinDetailsProvider>
        <Consumer />
      </CheckinDetailsProvider>,
    );

    await act(async () => {
      await state.save({ email: "saved@example.org" });
    });
    await act(async () => answer(object("stale@example.org")));

    expect(update).toHaveBeenCalledWith({ email: "saved@example.org" });
    expect(screen.getByText("saved@example.org")).toBeInTheDocument();
  });

  it("says a read failed, and reads again on reload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    get.mockRejectedValueOnce(new Error("down"));
    render(
      <CheckinDetailsProvider>
        <Consumer />
      </CheckinDetailsProvider>,
    );

    await waitFor(() => expect(state.loadFailed).toBe(true));
    act(() => state.reload());

    expect(await screen.findByText("a@example.org")).toBeInTheDocument();
    expect(state.loadFailed).toBe(false);
  });
});

describe("useCheckinDetails", () => {
  it("refuses to run outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/CheckinDetailsProvider/);
  });
});
