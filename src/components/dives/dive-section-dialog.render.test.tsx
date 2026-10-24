import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveSectionDialog } from "./dive-section-dialog";
import { divesAPI, type Dive } from "@/lib/api/dives";
import { diveConditions } from "@/test/dive-fixtures";

// The seam is the PATCH body: a card's dialog sends its section and nothing else,
// whatever the rest of the dive holds. `user` is returned by identity - see the note
// in `dives/new/page.render.test.tsx`.
const stable = vi.hoisted(() => ({
  auth: {
    user: { uuid: "user-1", dive_form_hidden_fields: [] as string[] },
    mergeUser: vi.fn(),
  },
  toast: { toast: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => stable.toast,
}));

vi.mock("@/lib/api/dives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: { ...actual.divesAPI, updateDive: vi.fn() },
  };
});

vi.mock("@/lib/api/tags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/tags")>();
  return { ...actual, fetchAllTags: vi.fn() };
});

const tags = await import("@/lib/api/tags");

const storedDive = (overrides: Partial<Dive> = {}): Dive =>
  ({
    uuid: "dive-1",
    user_uuid: "user-1",
    dive_number: 41,
    start_time: "2026-07-01T09:30:00+02:00",
    submerged_time: 2700,
    max_depth: 18.3,
    rating: 3,
    tags: ["night"],
    notes: "Saw a turtle.",
    mixtures: [],
    gear_items: [],
    dive_sites: [],
    sightings: [],
    ...overrides,
  }) as Dive;

const renderNotes = (dive: Dive, onSaved = vi.fn()) => {
  const onOpenChange = vi.fn();
  render(
    <DiveSectionDialog
      open
      onOpenChange={onOpenChange}
      dive={dive}
      section="Notes"
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
};

const saveChanges = () =>
  userEvent.click(screen.getByRole("button", { name: /save changes/i }));

beforeEach(() => {
  vi.clearAllMocks();
  stable.auth.user.dive_form_hidden_fields = [];
  vi.mocked(divesAPI.updateDive).mockResolvedValue({ message: "ok" });
  vi.mocked(tags.fetchAllTags).mockResolvedValue([]);
});

describe("a card's edit dialog", () => {
  it("sends its section's fields and nothing else", async () => {
    const { onSaved, onOpenChange } = renderNotes(storedDive());

    const notes = screen.getByRole("textbox", { name: /^notes$/i });
    await userEvent.clear(notes);
    await userEvent.type(notes, "Two turtles.");
    await saveChanges();

    await waitFor(() => expect(divesAPI.updateDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.updateDive).mock.calls[0]).toEqual([
      "dive-1",
      { rating: 3, tags: ["night"], notes: "Two turtles." },
    ]);
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("is not blocked by a stored value it does not show", async () => {
    // Below the schema's floor, and nowhere in the Notes section to correct.
    renderNotes(storedDive({ max_depth: -1 }));

    await saveChanges();

    await waitFor(() => expect(divesAPI.updateDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.updateDive).mock.calls[0][1]).not.toHaveProperty(
      "max_depth",
    );
  });

  it("shows a field of its section that the stored set hides", () => {
    stable.auth.user.dive_form_hidden_fields = ["rating"];
    renderNotes(storedDive({ rating: null }));

    expect(
      screen.getByRole("radiogroup", { name: /^rating$/i }),
    ).toBeInTheDocument();
  });

  it("stays open and says why when the save fails", async () => {
    vi.mocked(divesAPI.updateDive).mockRejectedValue(new Error("boom"));
    const { onSaved, onOpenChange } = renderNotes(storedDive());

    await saveChanges();

    expect(
      await screen.findByText("Failed to update dive. Please try again."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("the Environment dialog on a dive with fetched conditions", () => {
  const filled = () =>
    storedDive({
      air_temperature: 38.1,
      weather: "clear",
      conditions: diveConditions({
        filled: { air_temperature: 38.1, weather: "clear", waves: null },
      }),
    });

  const renderEnvironment = (dive: Dive) =>
    render(
      <DiveSectionDialog
        open
        onOpenChange={vi.fn()}
        dive={dive}
        section="Environment"
        onSaved={vi.fn()}
      />,
    );

  const marked = () =>
    [...document.querySelectorAll('[title^="Filled in from weather data"]')]
      .map((mark) => mark.closest("label")?.childNodes[0]?.textContent ?? "")
      .map((text) => text.trim());

  it("marks the fetched fields and credits the service", () => {
    renderEnvironment(filled());

    expect(marked()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Weather/),
        expect.stringMatching(/^Air temperature/),
      ]),
    );
    expect(marked()).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Weather data by Open-Meteo.com" }),
    ).toBeInTheDocument();
  });

  it("takes the mark off a field the diver changes, and the credit with the last", async () => {
    renderEnvironment(
      storedDive({
        air_temperature: 38.1,
        conditions: diveConditions({
          filled: { air_temperature: 38.1, weather: null, waves: null },
        }),
      }),
    );

    const air = screen.getByRole("spinbutton", { name: /air temperature/i });
    await userEvent.clear(air);
    await userEvent.type(air, "30");

    expect(marked()).toHaveLength(0);
    expect(screen.queryByText(/Open-Meteo/)).toBeNull();
  });

  // The API keeps a fill it is sent a blank for, so the field would come back
  // fetched after the save.
  it("keeps the mark and the credit on a field the diver empties", async () => {
    renderEnvironment(
      storedDive({
        air_temperature: 38.1,
        conditions: diveConditions({
          filled: { air_temperature: 38.1, weather: null, waves: null },
        }),
      }),
    );

    await userEvent.clear(
      screen.getByRole("spinbutton", { name: /air temperature/i }),
    );

    expect(marked()).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Weather data by Open-Meteo.com" }),
    ).toBeInTheDocument();
  });

  it("marks nothing on a dive with no conditions", () => {
    renderEnvironment(storedDive({ weather: "clear", conditions: null }));

    expect(marked()).toHaveLength(0);
    expect(screen.queryByText(/Open-Meteo/)).toBeNull();
  });
});
