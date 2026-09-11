import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveProfileCard } from "./dive-profile-card";
import type { Dive, DiveProfile, Recording } from "@/lib/api/dives";

// The chart itself has its own suite. What only this card can answer is which
// recording's samples are on screen - a question that did not exist while a dive
// had one profile, and the one thing a second computer changes about this page.

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: { getRecordingProfile: vi.fn() },
}));

// The card's description reads the diver's units, so it needs an auth context.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

// The chart draws SVG against measured geometry, which jsdom has none of. This
// suite is about the switcher above it.
vi.mock("./dive-profile-chart", () => ({
  DiveProfileChart: () => <div data-testid="profile-chart" />,
}));

const { divesAPI } = await import("@/lib/api/dives");

function profileInfo(uuid: string) {
  return {
    uuid,
    duration: 2940,
    depth_sample_count: 314,
    // This card draws samples and never asks where they came from, so every
    // fixture here is the ordinary file-backed case.
    provenance: "file" as const,
    channels: ["depth"],
  };
}

function recording(overrides: Partial<Recording> = {}): Recording {
  return { uuid: "r1", ordinal: 0, files: [], ...overrides };
}

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "d1",
    dive_number: 2,
    start_time: "2026-09-08T15:18:10",
    duration: 3163,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-09-08T13:18:10Z",
    mixtures: [],
    ...overrides,
  };
}

const twoComputers = dive({
  recordings: [
    recording({
      uuid: "perdix",
      ordinal: 0,
      device: { model: "Perdix 3", serial: "D9772626" },
      profile: profileInfo("p-perdix"),
    }),
    recording({
      uuid: "ocean",
      ordinal: 1,
      device: { brand: "Suunto", serial: "253810000400", name: "Porvoo" },
      profile: profileInfo("p-ocean"),
    }),
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(divesAPI.getRecordingProfile).mockResolvedValue({
    duration: 2940,
    pressures: [],
    events: [],
  } as unknown as DiveProfile);
});

describe("DiveProfileCard", () => {
  it("renders nothing for a dive whose recordings carried no samples", () => {
    const { container } = render(
      <DiveProfileCard dive={dive({ recordings: [recording()] })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("asks the recording route for the primary's samples", async () => {
    render(
      <DiveProfileCard
        dive={dive({
          recordings: [recording({ profile: profileInfo("p1") })],
        })}
      />,
    );

    await waitFor(() =>
      expect(divesAPI.getRecordingProfile).toHaveBeenCalledWith(
        "d1",
        "r1",
        expect.stringContaining("p1"),
      ),
    );
  });

  it("offers no switcher on a dive one computer recorded", () => {
    // One button labelled with the only device there is says nothing and takes
    // a row of the card to say it.
    render(
      <DiveProfileCard
        dive={dive({
          recordings: [
            recording({
              device: { model: "Perdix 3" },
              profile: profileInfo("p1"),
            }),
          ],
        })}
      />,
    );

    expect(
      screen.queryByTestId("profile-recording-switcher"),
    ).not.toBeInTheDocument();
  });

  it("switches between two computers' curves, labelled by device", async () => {
    render(<DiveProfileCard dive={twoComputers} />);

    await waitFor(() =>
      expect(divesAPI.getRecordingProfile).toHaveBeenCalledWith(
        "d1",
        "perdix",
        expect.anything(),
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Suunto · 253810000400 (Porvoo)" }),
    );

    await waitFor(() =>
      expect(divesAPI.getRecordingProfile).toHaveBeenCalledWith(
        "d1",
        "ocean",
        expect.anything(),
      ),
    );
  });

  it("marks which recording is on screen, for a reader who cannot see the fill", async () => {
    render(<DiveProfileCard dive={twoComputers} />);

    const perdix = screen.getByRole("button", { name: /Perdix 3/ });
    const ocean = screen.getByRole("button", { name: /Porvoo/ });
    expect(perdix).toHaveAttribute("aria-pressed", "true");
    expect(ocean).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(ocean);
    expect(ocean).toHaveAttribute("aria-pressed", "true");
    expect(perdix).toHaveAttribute("aria-pressed", "false");
  });

  it("skips a recording with no samples rather than offering a button that 404s", () => {
    // A recording whose files carried none has nothing to draw, and the route
    // answers 404 permanently - so a button for it is a dead end with a device
    // name on it.
    render(
      <DiveProfileCard
        dive={dive({
          recordings: [
            recording({
              uuid: "perdix",
              ordinal: 0,
              device: { model: "Perdix 3" },
              profile: profileInfo("p1"),
            }),
            recording({
              uuid: "bare",
              ordinal: 1,
              device: { brand: "Suunto" },
            }),
          ],
        })}
      />,
    );

    expect(
      screen.queryByTestId("profile-recording-switcher"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Suunto/ }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the first charted recording when the chosen one goes", async () => {
    // Deleting a recording, or promoting another, reorders the list. Holding the
    // choice by uuid rather than by index is what stops the card quietly drawing
    // a different device's curves under the old selection.
    const { rerender } = render(<DiveProfileCard dive={twoComputers} />);

    await userEvent.click(screen.getByRole("button", { name: /Porvoo/ }));
    await waitFor(() =>
      expect(divesAPI.getRecordingProfile).toHaveBeenCalledWith(
        "d1",
        "ocean",
        expect.anything(),
      ),
    );

    rerender(
      <DiveProfileCard
        dive={dive({
          recordings: [
            recording({
              uuid: "perdix",
              ordinal: 0,
              device: { model: "Perdix 3" },
              profile: profileInfo("p-perdix"),
            }),
          ],
        })}
      />,
    );

    await waitFor(() =>
      expect(divesAPI.getRecordingProfile).toHaveBeenLastCalledWith(
        "d1",
        "perdix",
        expect.anything(),
      ),
    );
  });
});
