import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewDivePage from "./page";
import { divesAPI, type Dive } from "@/lib/api/dives";
import type { Species } from "@/lib/api/species";
import {
  DIVE_FORM_ALWAYS_ON_FIELDS,
  DIVE_FORM_FIELDS,
} from "@/lib/dive-form-fields";

// The seam this covers is the page's own seeding, which no unit test can reach: the
// form's `defaultValues` and the last-dive prefill both decide what `mixtures` holds
// before the diver touches anything, and `onSubmit` sends it unconditionally. The
// question is what a diver who never opens the gas card ends up with on the wire -
// and the answer used to be a cylinder the page invented (an 11.1 L of air), which
// `prefillFromLastDive` then carried to the next dive and `diveModWarning` was happy
// to raise a depth warning against.

// Every one of these is returned by identity rather than rebuilt per call, and
// for `user` that is load-bearing rather than tidiness: the real `AuthContext`
// keeps its value referentially stable, and this page's prefill effect lists
// `user` in its dependencies. A mock handing back a fresh `user` per render
// re-runs that effect on every render, and the effect ends in `form.reset` - so
// on any test whose last dive exists, reset and effect drive each other round in
// an unbounded loop. It fails nothing outright; it just re-reads the last dive
// ~75 times a second for as long as the page is mounted, which is what made this
// file's timings wander and its slowest tests reach vitest's 5s limit. Pinned by
// "reads the last dive once" below. Same trap as the `useRouter` note in
// DECISIONS.md, one hook further along.
//
// `vi.hoisted` because a `vi.mock` factory is hoisted above every other
// statement in the file and so cannot close over an ordinary `const`.
//
// `dive_form_hidden_fields` lives on that same pinned object rather than being handed
// back fresh, for the same reason: the visibility hook memoizes the account's stored
// set on it, and `mergeUser` is what the real context would use to fold a saved toggle
// back in. Mutating in place keeps `user`'s identity stable, which is what the prefill
// effect's `user.uuid` key is there to survive anyway.
const stable = vi.hoisted(() => ({
  auth: {
    user: { uuid: "user-1", dive_form_hidden_fields: [] as string[] },
    isAuthenticated: true,
    isLoading: false,
    mergeUser: vi.fn((fields: Record<string, unknown>) => {
      Object.assign(stable.auth.user, fields);
    }),
  },
  router: { push: vi.fn(), replace: vi.fn() },
  searchParams: new URLSearchParams(),
  toast: { toast: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
  useSearchParams: () => stable.searchParams,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => stable.toast,
}));

// `importOriginal` throughout: these modules also export the constants and enums the
// form itself renders from (`GAS_ROLES`, `DIVE_FILE_ACCEPT`), so replacing a whole
// module wholesale breaks the page rather than stubbing its requests.
vi.mock("@/lib/api/dives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: {
      ...actual.divesAPI,
      getDives: vi.fn(),
      getDive: vi.fn(),
      createDive: vi.fn(),
      getNextDiveNumber: vi.fn(),
      parseDiveFile: vi.fn(),
    },
  };
});

vi.mock("@/lib/api/trips", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/trips")>();
  return {
    ...actual,
    tripsAPI: { ...actual.tripsAPI, getTrips: vi.fn() },
  };
});

vi.mock("@/lib/api/dive-sites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dive-sites")>();
  return {
    ...actual,
    diveSitesAPI: { ...actual.diveSitesAPI, getDiveSites: vi.fn() },
  };
});

vi.mock("@/lib/api/species", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/species")>();
  return {
    ...actual,
    speciesAPI: {
      ...actual.speciesAPI,
      searchSpecies: vi.fn(),
      resolveSpecies: vi.fn(),
      getSpecies: vi.fn(),
    },
  };
});

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return {
    ...actual,
    authAPI: { ...actual.authAPI, updateProfile: vi.fn() },
  };
});

// The Fields menu reads the account's presets on mount, to label its own trigger with
// the one the stored set matches. Left real, that
// is an XHR against jsdom's own origin - the trap the gear mock below records.
vi.mock("@/lib/api/dive-form-presets", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/dive-form-presets")>();
  return {
    ...actual,
    fetchAllDiveFormPresets: vi.fn(),
    diveFormPresetsAPI: {
      ...actual.diveFormPresetsAPI,
      createPreset: vi.fn(),
      updatePreset: vi.fn(),
      deletePreset: vi.fn(),
      restoreDefaults: vi.fn(),
    },
  };
});

vi.mock("@/lib/api/gear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    fetchAllGearSets: vi.fn(),
    // `getGearItem` singular alongside the plural: the gear picker looks a
    // carried-over uuid up by itself when nothing on hand names it, and left
    // real this test file put an actual XHR on the wire - resolved against
    // jsdom's `localhost:3000`, so it answered from whatever dev server
    // happened to be up, at whatever speed it happened to be compiling at.
    gearAPI: { ...actual.gearAPI, getGearItems: vi.fn(), getGearItem: vi.fn() },
  };
});

const { authAPI } = await import("@/lib/api/auth");
const presets = await import("@/lib/api/dive-form-presets");
const { tripsAPI } = await import("@/lib/api/trips");
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const gear = await import("@/lib/api/gear");
const { speciesAPI } = await import("@/lib/api/species");

const emptyPage = <T,>() => ({
  data: [] as T[],
  total_count: 0,
  has_more: false,
  page: 1,
  items_per_page: 10,
});

// A stored dive as `getDive` returns it, i.e. with `mixtures` present. Only the
// fields the prefill reads are spelled out; the rest of `Dive` is filled in loosely
// because nothing under test looks at it.
const storedDive = (overrides: Partial<Dive> = {}): Dive =>
  ({
    uuid: "dive-1",
    user_uuid: "user-1",
    dive_number: 41,
    start_time: "2026-07-01T09:30:00+02:00",
    duration: 2700,
    max_depth: 18.3,
    notes: "",
    mixtures: [],
    gear_items: [],
    dive_sites: [],
    ...overrides,
  }) as Dive;

beforeEach(() => {
  vi.clearAllMocks();
  stable.auth.user.dive_form_hidden_fields = [];
  stable.searchParams = new URLSearchParams();
  vi.mocked(authAPI.updateProfile).mockResolvedValue(undefined);
  vi.mocked(presets.fetchAllDiveFormPresets).mockResolvedValue([]);
  vi.mocked(divesAPI.getDives).mockResolvedValue(emptyPage());
  vi.mocked(divesAPI.getNextDiveNumber).mockResolvedValue({
    dive_number: 42,
    is_taken: false,
  });
  vi.mocked(divesAPI.createDive).mockResolvedValue(storedDive());
  vi.mocked(tripsAPI.getTrips).mockResolvedValue(emptyPage());
  vi.mocked(diveSitesAPI.getDiveSites).mockResolvedValue(emptyPage());
  vi.mocked(gear.fetchAllGearSets).mockResolvedValue([]);
  vi.mocked(gear.gearAPI.getGearItems).mockResolvedValue(emptyPage());
  vi.mocked(gear.gearAPI.getGearItem).mockImplementation(
    async (uuid) =>
      ({
        uuid,
        name: "MK25",
        is_archived: false,
      }) as Awaited<ReturnType<typeof gear.gearAPI.getGearItem>>,
  );
  vi.mocked(speciesAPI.searchSpecies).mockResolvedValue({
    results: [],
    has_more: false,
  });
});

// Everything the create schema requires that the page doesn't already seed. Dive
// number and start time arrive filled in; duration does not.
//
// `fireEvent.change` rather than `userEvent.type`, for the same reason the O₂
// box below uses it: nothing here is about the keystrokes. The box is a
// controlled `FormField`, so typing re-renders the whole page once per
// character - five renders and ~60ms to set a value one change event sets in
// ~3ms. Where the typing itself is the point (the depth warning below), the
// tests still type.
function fillRequiredFields() {
  // Role-scoped, not `getByLabelText`: the Fields dialog puts a "Duration" switch on
  // the page beside the form's own box, and both answer to the label. Several of
  // these tests fill the form with the panel already open.
  fireEvent.change(screen.getByRole("textbox", { name: /duration/i }), {
    target: { value: "45:00" },
  });
}

const logDive = () =>
  userEvent.click(screen.getByRole("button", { name: /log dive/i }));

describe("logging a dive without touching the gas card", () => {
  it("sends no mixtures at all", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    fillRequiredFields();

    await logDive();

    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].mixtures).toEqual(
      [],
    );
  });

  it("shows no tank card, and says so", async () => {
    render(<NewDivePage />);

    expect(
      await screen.findByText(/no cylinders recorded for this dive/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument();
  });

  it("raises no depth warning on a dive deep enough for one", async () => {
    // 60 m is past air's 56.7 m working limit, so the seeded cylinder used to make
    // this form warn about gas the diver never entered - the worst kind of wrong,
    // since it trains a diver to ignore the real ones.
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await userEvent.type(screen.getByLabelText(/maximum depth/i), "60");

    expect(screen.queryByText(/working limit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/past this mix/i)).not.toBeInTheDocument();
  });
});

describe("the gas card, once the diver opens it", () => {
  it("proposes a cylinder on Add Mixture, and lets it be taken back off", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await userEvent.click(screen.getByRole("button", { name: /add mixture/i }));
    // The proposal is still `DEFAULT_MIXTURE` - that is what the button is for.
    expect(screen.getByText(/^tank 1$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/O₂ \(%\)/)).toHaveValue(21);

    // Tank 1 had no remove button at all until this change, which is what made
    // "no cylinders" unreachable once a diver had added one.
    await userEvent.click(
      screen.getByRole("button", { name: /remove tank 1/i }),
    );

    expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/no cylinders recorded for this dive/i),
    ).toBeInTheDocument();
  });

  it("stores an empty list when the only cylinder is removed before saving", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    fillRequiredFields();

    await userEvent.click(screen.getByRole("button", { name: /add mixture/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /remove tank 1/i }),
    );
    await logDive();

    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].mixtures).toEqual(
      [],
    );
  });

  it("sends the cylinder the diver did enter", async () => {
    // The other half of the same rule: nothing here suppresses gas, it only stops
    // the page supplying it.
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    fillRequiredFields();

    await userEvent.click(screen.getByRole("button", { name: /add mixture/i }));
    // `fireEvent.change` rather than clear-then-type: react-hook-form re-displays a
    // field's default whenever its value resolves to `undefined`, so emptying the box
    // snaps it back to the appended 21 and the typed digits land after it.
    fireEvent.change(screen.getByLabelText(/O₂ \(%\)/), {
      target: { value: "32" },
    });
    await logDive();

    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].mixtures).toEqual([
      { volume: 11.1, oxygen: 32, helium: 0 },
    ]);
  });
});

describe("the last-dive prefill", () => {
  it("carries the previous dive's cylinders over", async () => {
    // The convenience the seed was defended on actually lives here, and it is
    // untouched: a diver who logs gas still gets it back on the next dive.
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      ...emptyPage<Dive>(),
      data: [storedDive()],
      total_count: 1,
    });
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({
        mixtures: [
          {
            id: 7,
            volume: 15,
            oxygen: 32,
            helium: 0,
            start_pressure: 210,
            end_pressure: 60,
            po2_limit: 1.4,
            gas_number: 1,
            role: "bottom",
          },
        ],
      }),
    );

    render(<NewDivePage />);

    await waitFor(() =>
      expect(screen.getByLabelText(/O₂ \(%\)/)).toHaveValue(32),
    );
    expect(screen.getByLabelText(/He \(%\)/)).toHaveValue(0);
    // Pressures are deliberately not carried - they are per fill.
    expect(screen.getByLabelText(/start pressure/i)).toHaveValue(null);
  });

  it("carries a parallel flag over, which no import will ever supply", async () => {
    // The field the carry-over helps most: a sidemount diver's next dive is
    // sidemount, and nothing but their own hand can set this. Re-flagging both
    // cylinders every dive is the friction that would stop the flag being used.
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      ...emptyPage<Dive>(),
      data: [storedDive()],
      total_count: 1,
    });
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({
        mixtures: [
          {
            id: 7,
            volume: 11.1,
            oxygen: 21,
            helium: 0,
            start_pressure: 210,
            end_pressure: 60,
            usage: "parallel",
          },
          {
            id: 8,
            volume: 11.1,
            oxygen: 21,
            helium: 0,
            start_pressure: 205,
            end_pressure: 55,
            usage: "parallel",
          },
        ],
      }),
    );

    render(<NewDivePage />);

    await waitFor(() =>
      expect(screen.getAllByLabelText(/^usage$/i)).toHaveLength(2),
    );
    for (const select of screen.getAllByLabelText(/^usage$/i)) {
      expect(select).toHaveValue("parallel");
    }
  });

  it("leaves the card empty when the previous dive recorded no gas", async () => {
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      ...emptyPage<Dive>(),
      data: [storedDive()],
      total_count: 1,
    });
    vi.mocked(divesAPI.getDive).mockResolvedValue(storedDive({ mixtures: [] }));

    render(<NewDivePage />);
    await waitFor(() => expect(divesAPI.getDive).toHaveBeenCalled());

    expect(
      await screen.findByText(/no cylinders recorded for this dive/i),
    ).toBeInTheDocument();
    // The bug this pins: a cylinder-less dive used to hand the next form a
    // fabricated one, so the phantom propagated down the log rather than staying
    // on dive 1.
    expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument();
  });

  it("carries the previous dive's water and altitude over", async () => {
    // An explicit carry-over policy, decided rather than inherited: the two are
    // properties of where the diver is, and dive two of a day is usually in the
    // same water at the same elevation. Bottom temperature, right beside them on
    // the form, deliberately does not carry - it is a reading taken on the day.
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      ...emptyPage<Dive>(),
      data: [storedDive()],
      total_count: 1,
    });
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({
        water_type: "brackish",
        altitude: 372,
        bottom_temperature: 22.5,
      }),
    );

    render(<NewDivePage />);

    await waitFor(() =>
      expect(screen.getByLabelText(/water type/i)).toHaveValue("brackish"),
    );
    // Anchored, because the field's entry-unit toggle beside it is named
    // "m | ft — switch altitude entry to feet" and an unanchored /altitude/
    // now matches both. The label is the one that *starts* with the word.
    expect(screen.getByLabelText(/^altitude/i)).toHaveValue(372);
    expect(screen.getByLabelText(/bottom temperature/i)).toHaveValue(null);
  });

  it("reads the last dive once, not once per render", async () => {
    // The prefill's own effect writes the form it depends on, so anything that
    // gives it a new identity every render puts it in a loop with its own
    // `form.reset`. It ran that way here for a while - the mocks above handed
    // back a fresh `user` object per call - and cost nothing visible except
    // time: ~75 last-dive fetches a second for as long as the page was mounted,
    // which is what made this file's slowest tests wander into vitest's 5s
    // limit. Counting the calls is the only symptom that shows up as a failure.
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      ...emptyPage<Dive>(),
      data: [storedDive()],
      total_count: 1,
    });
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({ water_type: "brackish" }),
    );

    render(<NewDivePage />);

    await waitFor(() =>
      expect(screen.getByLabelText(/water type/i)).toHaveValue("brackish"),
    );
    expect(divesAPI.getDives).toHaveBeenCalledTimes(1);
    expect(divesAPI.getDive).toHaveBeenCalledTimes(1);
  });
});

// The create page's own conversion, which no unit test reaches: the select's
// cleared state is `""`, and `DiveCreate` would be 422'd for it.
describe("the water type on the way to the API", () => {
  it("omits the field when the picker was left at Not recorded", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    fillRequiredFields();

    await logDive();

    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    const body = vi.mocked(divesAPI.createDive).mock.calls[0][0];
    expect(body.water_type).toBeUndefined();
  });

  it("sends the water type the diver chose", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    fillRequiredFields();

    await userEvent.selectOptions(
      screen.getByLabelText(/water type/i),
      "en13319",
    );
    await logDive();

    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].water_type).toBe(
      "en13319",
    );
  });
});

describe("what the create form carries over from the last dive", () => {
  it("carries the gear but not the species", async () => {
    // Gear is habitual, sightings are observations: copying yesterday's turtle
    // into today's dive would fabricate a record of having seen it. The
    // prefill's `form.reset` enumerates every field, so this also pins that the
    // field is listed there - leaving it out would reset it to `undefined`.
    vi.mocked(divesAPI.getDives).mockResolvedValue({
      ...emptyPage<Dive>(),
      data: [storedDive({ uuid: "dive-99" })],
      total_count: 1,
    });
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({
        gear_items: [
          {
            uuid: "item-1",
            name: "MK25",
            is_archived: false,
          } as Dive["gear_items"][number],
        ],
        species: [
          {
            uuid: "species-1",
            scientific_name: "Chelonia mydas",
            common_name: "Green sea turtle",
            rank: "Species",
          },
        ],
      }),
    );
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await waitFor(() => expect(divesAPI.getDive).toHaveBeenCalled());
    fillRequiredFields();

    await logDive();

    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    const body = vi.mocked(divesAPI.createDive).mock.calls[0][0];
    expect(body.gear_item_uuids).toEqual(["item-1"]);
    expect(body.species_uuids).toEqual([]);
  });
});

describe("saving while a species pick is still resolving", () => {
  it("holds the save until the resolve lands, rather than dropping the sighting", async () => {
    // The window is a second or two - a resolve fans out to WoRMS and Wikidata -
    // and the loss inside it would be silent: the pick lives in the picker's
    // local state until its uuid comes back, so a save that beat it would write
    // the dive without the sighting and say nothing.
    vi.mocked(speciesAPI.searchSpecies).mockResolvedValue({
      results: [
        {
          aphia_id: 278400,
          uuid: null,
          scientific_name: "Amphiprion ocellaris",
          common_name: "Ocellaris clownfish",
          rank: "Species",
          status: "accepted",
          matched_name: null,
          source: "wikidata",
          attribution: "Wikidata (CC0)",
        },
      ],
      has_more: false,
    });
    let settle: (species: Species) => void = () => {};
    vi.mocked(speciesAPI.resolveSpecies).mockReturnValue(
      new Promise<Species>((resolve) => {
        settle = resolve;
      }),
    );

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    fillRequiredFields();

    await userEvent.click(screen.getByLabelText("Species spotted"));
    await userEvent.click(
      await screen.findByRole("option", { name: /Ocellaris clownfish/ }),
    );

    const submit = screen.getByRole("button", { name: /adding species/i });
    expect(submit).toBeDisabled();

    settle({
      uuid: "species-1",
      aphia_id: 278400,
      scientific_name: "Amphiprion ocellaris",
      common_name: "Ocellaris clownfish",
      rank: "Species",
    } as Species);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /log dive/i })).toBeEnabled(),
    );
    await logDive();

    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(
      vi.mocked(divesAPI.createDive).mock.calls[0][0].species_uuids,
    ).toEqual(["species-1"]);
  });
});

// ---------------------------------------------------------------------------
// Hiding and showing fields
// ---------------------------------------------------------------------------
//
// The seam here is the same one the rest of this file covers - the page's own
// seeding - now with a stored hidden set in front of it. What no unit test can reach
// is the interaction between the two: what a diver who hides Weight *saves*, and what
// happens to a value the prefill had already put there.

// The Fields control is a menu now, and the switches live behind its last entry.
const openFieldsPanel = async () => {
  await userEvent.click(screen.getByRole("button", { name: /fields/i }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /configure/i }),
  );
};

// Configure is a modal dialog, so the form behind it is `aria-hidden` while it is
// open: anything asserting on a field has to shut it first. That is the interaction
// itself, not a testing detail - a diver sees a hidden field go only once they are
// back on the form.
const closeFieldsPanel = () => userEvent.keyboard("{Escape}");

/**
 * The Configure dialog, for queries that would otherwise also match the menu's own
 * trigger - which is labelled with the preset the stored set matches.
 */
const inFieldsPanel = () => within(screen.getByRole("dialog"));

// The dialog opens on Fields; the preset list is the other tab.
const openPresetsTab = () =>
  userEvent.click(screen.getByRole("tab", { name: /presets/i }));

const openFieldsMenu = () =>
  userEvent.click(screen.getByRole("button", { name: /fields/i }));

const lastDiveWith = (overrides: Partial<Dive>) => {
  vi.mocked(divesAPI.getDives).mockResolvedValue({
    ...emptyPage<Dive>(),
    data: [storedDive()],
    total_count: 1,
  });
  vi.mocked(divesAPI.getDive).mockResolvedValue(storedDive(overrides));
};

describe("a stored hidden set", () => {
  it("leaves the field out of the first render, not on screen and then away", async () => {
    stable.auth.user.dive_form_hidden_fields = ["altitude"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    expect(
      screen.queryByRole("spinbutton", { name: /altitude/i }),
    ).not.toBeInTheDocument();
    // Its neighbour in the same grid row is untouched, so this is one field going
    // rather than the block around it.
    expect(screen.getByLabelText(/water type/i)).toBeInTheDocument();
  });

  it("takes the whole Gas Mixtures section with `mixtures`", async () => {
    stable.auth.user.dive_form_hidden_fields = ["mixtures"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    expect(screen.queryByText(/^gas mixtures$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add mixture/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no cylinders recorded for this dive/i),
    ).not.toBeInTheDocument();
  });

  it("takes one input off every tank card for a per-cylinder key", async () => {
    stable.auth.user.dive_form_hidden_fields = ["mixture.role"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await userEvent.click(screen.getByRole("button", { name: /add mixture/i }));
    await userEvent.click(screen.getByRole("button", { name: /add mixture/i }));

    expect(screen.getAllByLabelText(/^usage$/i)).toHaveLength(2);
    expect(screen.queryByLabelText(/^role$/i)).not.toBeInTheDocument();
  });

  it("hides Weight without taking Gear with it", async () => {
    // The two are nested in one render so the gear picker can write the weight, and
    // that nesting used to be the reason they could not come apart.
    stable.auth.user.dive_form_hidden_fields = ["weight"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    expect(screen.getByLabelText(/^gear$/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: /^weight/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Gear without taking Weight with it", async () => {
    stable.auth.user.dive_form_hidden_fields = ["gear_item_uuids"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    expect(screen.queryByLabelText(/^gear$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: /^weight/i }),
    ).toBeInTheDocument();
  });
});

describe("what the prefill does to a hidden field", () => {
  it("leaves it empty while still carrying the visible ones", async () => {
    lastDiveWith({ weight: 8, altitude: 372 });
    stable.auth.user.dive_form_hidden_fields = ["weight"];

    render(<NewDivePage />);

    await waitFor(() =>
      expect(
        screen.getByRole("spinbutton", { name: /^altitude/i }),
      ).toHaveValue(372),
    );
    expect(
      screen.queryByRole("spinbutton", { name: /^weight/i }),
    ).not.toBeInTheDocument();

    fillRequiredFields();
    await logDive();
    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].weight).toBeNull();
  });

  it("fills it from the last dive the moment it is shown, and empties it again on hide", async () => {
    // Both halves of owner decision 1 in one test: a field shown later holds what it
    // would have held had it been visible all along, and it is still *untouched*, so
    // hiding it again takes the value back out.
    lastDiveWith({ weight: 8 });
    stable.auth.user.dive_form_hidden_fields = ["weight"];

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await waitFor(() => expect(divesAPI.getDive).toHaveBeenCalled());

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^weight$/i }));
    await closeFieldsPanel();

    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /^weight/i })).toHaveValue(
        8,
      ),
    );

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^weight$/i }));
    await closeFieldsPanel();
    await waitFor(() =>
      expect(
        screen.queryByRole("spinbutton", { name: /^weight/i }),
      ).not.toBeInTheDocument(),
    );

    fillRequiredFields();
    await logDive();
    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].weight).toBeNull();
  });

  it("empties a carried field the diver hides without touching", async () => {
    lastDiveWith({ weight: 8 });

    render(<NewDivePage />);
    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /^weight/i })).toHaveValue(
        8,
      ),
    );

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^weight$/i }));
    await closeFieldsPanel();

    fillRequiredFields();
    await logDive();
    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].weight).toBeNull();
  });

  it("keeps a value the diver typed, hidden or not", async () => {
    // The other half of the rule, and the one that makes hiding safe: what the diver
    // entered is theirs, and the API is sent exactly what the form holds - hidden
    // fields included, which is react-hook-form's `shouldUnregister: false` default.
    lastDiveWith({ weight: 8 });

    render(<NewDivePage />);
    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /^weight/i })).toHaveValue(
        8,
      ),
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: /^weight/i }), {
      target: { value: "7" },
    });

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^weight$/i }));
    await closeFieldsPanel();

    fillRequiredFields();
    await logDive();
    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].weight).toBe(7);
  });

  it("fills and empties the gas card as the section is shown and hidden", async () => {
    lastDiveWith({
      mixtures: [
        {
          id: 7,
          volume: 15,
          oxygen: 32,
          helium: 0,
          start_pressure: 210,
          end_pressure: 60,
          po2_limit: 1.4,
          gas_number: 1,
          role: "bottom",
        },
      ],
    });
    stable.auth.user.dive_form_hidden_fields = ["mixtures"];

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await waitFor(() => expect(divesAPI.getDive).toHaveBeenCalled());
    expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument();

    await openFieldsPanel();
    await userEvent.click(
      screen.getByRole("switch", { name: /^gas mixtures$/i }),
    );
    await closeFieldsPanel();

    await waitFor(() =>
      expect(screen.getByLabelText(/O₂ \(%\)/)).toHaveValue(32),
    );
    // Pressures are per fill and are never carried, shown or not.
    expect(
      screen.getByRole("spinbutton", { name: /start pressure/i }),
    ).toHaveValue(null);

    await openFieldsPanel();
    await userEvent.click(
      screen.getByRole("switch", { name: /^gas mixtures$/i }),
    );
    await closeFieldsPanel();
    await waitFor(() =>
      expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument(),
    );

    fillRequiredFields();
    await logDive();
    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].mixtures).toEqual(
      [],
    );
  });
});

describe("persisting a toggle", () => {
  it("sends the canonical list, and does not reset the form", async () => {
    // The trap this pins: the prefill effect used to key on the `user` object, and
    // folding a saved toggle back into the context replaces it. That would refetch
    // the last dive and re-stamp `start_time` with `nowStartTime()` - on a form the
    // diver was in the middle of.
    lastDiveWith({ water_type: "brackish" });

    render(<NewDivePage />);
    await waitFor(() =>
      expect(screen.getByLabelText(/water type/i)).toHaveValue("brackish"),
    );
    // Role-scoped from here on: opening the panel puts a "Water type" switch on the
    // page beside the form's own select, and both answer to the label. Start time
    // reads its button's text rather than a `value`: the control the label names is
    // the picker's trigger, and a `<button>` has no `value` to compare.
    const startTimeButton = () =>
      screen.getByRole("button", { name: /start time/i });
    const startTime = startTimeButton().textContent;
    const waterType = () =>
      screen.getByRole("combobox", { name: /water type/i });

    await openFieldsPanel();
    // Unchecked in reverse form order, so what arrives on the wire can only be
    // canonical if the client put it in order.
    await userEvent.click(screen.getByRole("switch", { name: /^notes$/i }));
    await userEvent.click(screen.getByRole("switch", { name: /^altitude$/i }));

    await waitFor(() =>
      expect(authAPI.updateProfile).toHaveBeenCalledWith({
        dive_form_hidden_fields: ["altitude", "notes"],
      }),
    );
    await closeFieldsPanel();
    expect(divesAPI.getDives).toHaveBeenCalledTimes(1);
    expect(divesAPI.getDive).toHaveBeenCalledTimes(1);
    expect(waterType()).toHaveValue("brackish");
    expect(startTimeButton().textContent).toBe(startTime);
  });

  it("debounces a burst into one request", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^notes$/i }));
    await userEvent.click(screen.getByRole("switch", { name: /^altitude$/i }));
    await userEvent.click(
      screen.getByRole("switch", { name: /^visibility$/i }),
    );

    await waitFor(() => expect(authAPI.updateProfile).toHaveBeenCalled());
    expect(authAPI.updateProfile).toHaveBeenCalledTimes(1);
    expect(authAPI.updateProfile).toHaveBeenCalledWith({
      dive_form_hidden_fields: ["visibility", "altitude", "notes"],
    });
  });
});

describe("a course handed in the URL", () => {
  it("is on screen and on the wire even under a set that hides it", async () => {
    // "Log a Dive for this Course" is the click this protects: `course_uuid` is one
    // of the fourteen Basic hides, so without the reveal the dive would be filed
    // against no course and nothing on the form would say so.
    stable.searchParams = new URLSearchParams("course_uuid=course-9");
    stable.auth.user.dive_form_hidden_fields = ["course_uuid"];

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    expect(
      screen.getByRole("combobox", { name: /^course$/i }),
    ).toBeInTheDocument();
    await openFieldsPanel();
    expect(
      screen.getByText(/shown because it holds a value/i),
    ).toBeInTheDocument();
    await closeFieldsPanel();

    fillRequiredFields();
    await logDive();
    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].course_uuid).toBe(
      "course-9",
    );
  });

  it("keeps the course when the diver hides the field again", async () => {
    // A value that arrived from outside the diver's typing is the diver's, so hiding
    // its field never discards it - unlike a carried default.
    stable.searchParams = new URLSearchParams("course_uuid=course-9");
    stable.auth.user.dive_form_hidden_fields = [];

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^course$/i }));
    await closeFieldsPanel();
    await waitFor(() =>
      expect(
        screen.queryByRole("combobox", { name: /^course$/i }),
      ).not.toBeInTheDocument(),
    );

    fillRequiredFields();
    await logDive();
    await waitFor(() => expect(divesAPI.createDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.createDive).mock.calls[0][0].course_uuid).toBe(
      "course-9",
    );
  });
});

describe("a hidden field that fails validation", () => {
  it("comes back on screen with its message rather than doing nothing", async () => {
    // Nearly unreachable by hand - a hidden new-form field is empty and valid - and
    // that is exactly why it needs a test. The resolver validates hidden fields, so
    // without the reveal the save button would simply stop working.
    lastDiveWith({ altitude: 372 });

    render(<NewDivePage />);
    await waitFor(() =>
      expect(
        screen.getByRole("spinbutton", { name: /^altitude/i }),
      ).toHaveValue(372),
    );

    // Typed, so hiding keeps it - and out of range, so the resolver refuses.
    fireEvent.change(screen.getByRole("spinbutton", { name: /^altitude/i }), {
      target: { value: "9999" },
    });

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^altitude$/i }));
    await closeFieldsPanel();
    await waitFor(() =>
      expect(
        screen.queryByRole("spinbutton", { name: /^altitude/i }),
      ).not.toBeInTheDocument(),
    );

    fillRequiredFields();
    await logDive();

    await waitFor(() =>
      expect(
        screen.getByRole("spinbutton", { name: /^altitude/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/altitude must be between/i)).toBeInTheDocument();
    expect(divesAPI.createDive).not.toHaveBeenCalled();
  });
});

describe("the depth entry-unit toggle", () => {
  const depthToggles = () =>
    screen.queryAllByRole("button", { name: /switch depth entry/i });

  it("moves onto Average depth when Maximum depth is hidden", async () => {
    stable.auth.user.dive_form_hidden_fields = ["max_depth"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    expect(depthToggles()).toHaveLength(1);
    // The toggle sits inside the label row of the field it governs, so the field
    // beside it in the DOM is the one that carries it.
    expect(
      screen.getByRole("spinbutton", { name: /average depth/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: /maximum depth/i }),
    ).not.toBeInTheDocument();
  });

  it("leaves the form with no depth control when both are hidden", async () => {
    stable.auth.user.dive_form_hidden_fields = ["max_depth", "avg_depth"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    expect(depthToggles()).toHaveLength(0);

    // And the gas hint still says which unit its MOD is in, which is what makes a
    // form with no depth control readable rather than ambiguous.
    await userEvent.click(screen.getByRole("button", { name: /add mixture/i }));
    expect(screen.getByText(/MOD \d+(\.\d+)? m/)).toBeInTheDocument();
  });

  it("is back on Maximum depth as soon as it is shown again", async () => {
    stable.auth.user.dive_form_hidden_fields = ["max_depth"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await openFieldsPanel();
    await userEvent.click(
      screen.getByRole("switch", { name: /^maximum depth$/i }),
    );
    await closeFieldsPanel();

    await waitFor(() => expect(depthToggles()).toHaveLength(1));
    expect(
      screen.getByRole("spinbutton", { name: /maximum depth/i }),
    ).toBeInTheDocument();
  });
});

describe("the Fields control", () => {
  it("is a menu button, and opening it submits nothing", async () => {
    // `type="button"` is the guard: this renders on a card whose content is a
    // `<form>`, where the default type submits.
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    const control = screen.getByRole("button", { name: /fields/i });
    expect(control).toHaveAttribute("type", "button");
    expect(control).toHaveAttribute("aria-haspopup", "menu");
    expect(control).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(control);
    expect(control).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(divesAPI.createDive).not.toHaveBeenCalled();
  });

  it("lists every field as a switch, and the always-on ones as switches it will not move", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();

    expect(screen.getAllByRole("switch")).toHaveLength(
      DIVE_FORM_FIELDS.length + DIVE_FORM_ALWAYS_ON_FIELDS.length,
    );

    for (const entry of DIVE_FORM_ALWAYS_ON_FIELDS) {
      // The row reads like any other - no note, no muting - so on and unavailable
      // is the whole of what says the diver cannot hide it.
      const control = screen.getByRole("switch", {
        name: new RegExp(`^${entry.label}$`, "i"),
      });
      expect(control).toBeChecked();
      expect(control).toBeDisabled();
    }
  });

  it("leads the gas section with the switch that governs it", async () => {
    // `mixtures` sits mid-registry, after the three always-on cylinder columns it
    // decides the fate of and before the five per-cylinder ones the panel disables
    // while it is off. Listing it in that order would put the reason those rows are
    // unavailable below the rows it explains.
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();

    const section = screen.getByRole("group", { name: /gas mixtures/i });
    const rows = within(section)
      .getAllByRole("switch")
      .map((control) =>
        document
          .querySelector(`label[for="${CSS.escape(control.id)}"]`)
          ?.textContent?.trim(),
      );

    expect(rows).toEqual([
      "Gas Mixtures",
      "Volume",
      "O₂",
      "ppO₂ limit",
      "He",
      "Start pressure",
      "End pressure",
      "Role",
      "Usage",
    ]);
  });

  it("disables the per-cylinder rows while the gas section is off screen", async () => {
    stable.auth.user.dive_form_hidden_fields = ["mixtures"];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();

    expect(screen.getByRole("switch", { name: /^role$/i })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("switch", { name: /^gas mixtures$/i }),
    );
    expect(screen.getByRole("switch", { name: /^role$/i })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
//
// A preset is a snapshot: applying one copies its hidden set into the account's
// current state and nothing links the two afterwards. Everything below is about
// keeping those two ideas apart - which is also why the panel marks by set equality
// rather than by remembering which one was applied last.

const aPreset = (
  name: string,
  hidden_fields: string[],
  uuid = `preset-${name.toLowerCase()}`,
) =>
  ({
    uuid,
    user_uuid: "user-1",
    name,
    hidden_fields,
    created_at: "2026-09-01T00:00:00Z",
  }) as Awaited<ReturnType<typeof presets.fetchAllDiveFormPresets>>[number];

const RECREATIONAL = aPreset("Recreational", [
  "altitude",
  "mixture.po2_limit",
  "mixture.role",
  "mixture.usage",
]);
const TECHNICAL = aPreset("Technical", []);

describe("the preset list", () => {
  beforeEach(() => {
    vi.mocked(presets.fetchAllDiveFormPresets).mockResolvedValue([
      RECREATIONAL,
      TECHNICAL,
    ]);
  });

  it("marks the one whose set equals the stored state, and only that one", async () => {
    // The menu carries the mark, and only the menu: on the Presets tab, renaming
    // and deleting are the same acts whether or not a preset's set is the one on
    // the form. The mark is a word as well as a check, so this reads it out of the
    // accessible name rather than off the icon.
    stable.auth.user.dive_form_hidden_fields = [
      "altitude",
      "mixture.po2_limit",
      "mixture.role",
      "mixture.usage",
    ];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsMenu();

    expect(
      await screen.findByRole("menuitem", {
        name: /recreational\s*\(current fields\)/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /^technical$/i }),
    ).toBeInTheDocument();
  });

  it("leaves the Presets tab unmarked, current set or not", async () => {
    stable.auth.user.dive_form_hidden_fields = [];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();
    await openPresetsTab();

    // Technical hides nothing, so it matches a fresh account exactly - and still
    // gets no check, no `aria-current` and no "(current fields)" here.
    await inFieldsPanel().findByText("Technical");
    expect(inFieldsPanel().getByText("Technical")).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      inFieldsPanel().queryByText(/current fields/i),
    ).not.toBeInTheDocument();
  });

  it("marks nothing once the diver toggles a field of their own", async () => {
    stable.auth.user.dive_form_hidden_fields = [];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    // Technical hides nothing, so it matches a fresh account exactly.
    await openFieldsMenu();
    expect(
      await screen.findByRole("menuitem", {
        name: /technical\s*\(current fields\)/i,
      }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^notes$/i }));
    await closeFieldsPanel();

    await openFieldsMenu();
    expect(
      await screen.findByRole("menuitem", { name: /^technical$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /^recreational$/i }),
    ).toBeInTheDocument();
  });

  it("applies one from the menu by storing its set, not by remembering it", async () => {
    // The menu is the only place a preset is applied - Configure manages what the
    // presets are, and a second Apply there would put the quick path behind two
    // clicks and a dialog. What lands is the set: nothing afterwards remembers
    // which preset it came from.
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await userEvent.click(screen.getByRole("button", { name: /fields/i }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /recreational/i }),
    );

    await waitFor(() =>
      expect(authAPI.updateProfile).toHaveBeenCalledWith({
        dive_form_hidden_fields: RECREATIONAL.hidden_fields,
      }),
    );
    expect(
      screen.queryByRole("spinbutton", { name: /^altitude/i }),
    ).not.toBeInTheDocument();
  });

  it("names the trigger after the preset the stored set matches", async () => {
    stable.auth.user.dive_form_hidden_fields = RECREATIONAL.hidden_fields;
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Fields: Recreational" }),
      ).toHaveTextContent("Recreational"),
    );
  });

  it('names it "Custom" once the set matches no preset', async () => {
    // A preset is a snapshot, so a hidden set the diver has edited belongs to no
    // preset at all - and the trigger is the only place that says so.
    stable.auth.user.dive_form_hidden_fields = [];
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    // Technical hides nothing, so a fresh account starts on it.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Fields: Technical" }),
      ).toBeInTheDocument(),
    );

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^notes$/i }));
    await closeFieldsPanel();

    expect(
      screen.getByRole("button", { name: "Fields: Custom" }),
    ).toHaveTextContent("Custom");
  });

  it("saves the current fields under a new name", async () => {
    stable.auth.user.dive_form_hidden_fields = ["notes"];
    vi.mocked(presets.diveFormPresetsAPI.createPreset).mockResolvedValue(
      aPreset("Warm water", ["notes"], "preset-warm"),
    );

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();

    await userEvent.type(
      screen.getByRole("combobox", { name: /save as/i }),
      "Warm water",
    );
    expect(
      screen.getByText(/creates a new preset called "Warm water"/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(presets.diveFormPresetsAPI.createPreset).toHaveBeenCalledWith({
        user_uuid: "user-1",
        name: "Warm water",
        hidden_fields: ["notes"],
      }),
    );
    // And the new row is on the list without a refetch.
    await openPresetsTab();
    expect(await inFieldsPanel().findByText("Warm water")).toBeInTheDocument();
    expect(presets.fetchAllDiveFormPresets).toHaveBeenCalledTimes(1);
  });

  it("writes the current fields back into an existing preset", async () => {
    stable.auth.user.dive_form_hidden_fields = ["notes", "altitude"];
    vi.mocked(presets.diveFormPresetsAPI.updatePreset).mockResolvedValue({
      message: "ok",
    });

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();

    // A name that matches an existing preset is an overwrite, and the line under
    // the field says so before the button is pressed. Case-insensitively, because
    // that is how the API compares them.
    await userEvent.type(
      screen.getByRole("combobox", { name: /save as/i }),
      "recreational",
    );
    expect(
      screen.getByText(/replaces the fields saved in "Recreational"/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(presets.diveFormPresetsAPI.updatePreset).toHaveBeenCalledWith(
        RECREATIONAL.uuid,
        { hidden_fields: ["altitude", "notes"] },
      ),
    );
    // Which is what makes it the named one now: the trigger is set equality against
    // the stored state, so nothing has to remember that this was the preset saved.
    await closeFieldsPanel();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Fields: Recreational" }),
      ).toBeInTheDocument(),
    );
  });

  it("renames a preset", async () => {
    vi.mocked(presets.diveFormPresetsAPI.updatePreset).mockResolvedValue({
      message: "ok",
    });

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();
    await openPresetsTab();

    await screen.findByText("Recreational");
    // The pencil turns the row's name into a field and itself into a tick, so the
    // rename is typed where the old name was.
    await userEvent.click(
      screen.getByRole("button", { name: 'Rename "Recreational"' }),
    );
    const field = screen.getByRole("textbox", {
      name: 'New name for "Recreational"',
    });
    expect(field).toHaveValue("Recreational");
    await userEvent.clear(field);
    await userEvent.type(field, "Tropics");
    await userEvent.click(
      screen.getByRole("button", {
        name: 'Save the new name for "Recreational"',
      }),
    );

    await waitFor(() =>
      expect(presets.diveFormPresetsAPI.updatePreset).toHaveBeenCalledWith(
        RECREATIONAL.uuid,
        { name: "Tropics" },
      ),
    );
    expect(await screen.findByText("Tropics")).toBeInTheDocument();
    expect(screen.queryByText("Recreational")).not.toBeInTheDocument();
  });

  it("leaves the row alone when the rename is cancelled", async () => {
    // Delete becomes Cancel while a row is being edited: a delete button beside a
    // half-typed rename is one mis-click from destroying the row being renamed.
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();
    await openPresetsTab();

    await screen.findByText("Recreational");
    await userEvent.click(
      screen.getByRole("button", { name: 'Rename "Recreational"' }),
    );
    expect(
      screen.queryByRole("button", { name: 'Delete "Recreational"' }),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: 'New name for "Recreational"' }),
      "Tropics",
    );
    await userEvent.click(
      screen.getByRole("button", { name: 'Stop renaming "Recreational"' }),
    );

    expect(presets.diveFormPresetsAPI.updatePreset).not.toHaveBeenCalled();
    expect(screen.getByText("Recreational")).toBeInTheDocument();
    expect(screen.queryByText("Tropics")).not.toBeInTheDocument();
  });

  it("confirms before deleting, and leaves the form's fields alone", async () => {
    vi.mocked(presets.diveFormPresetsAPI.deletePreset).mockResolvedValue({
      message: "ok",
    });

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();
    await openPresetsTab();

    await screen.findByText("Recreational");
    await userEvent.click(
      screen.getByRole("button", { name: 'Delete "Recreational"' }),
    );

    expect(
      screen.getByRole("heading", { name: /delete this preset\?/i }),
    ).toBeInTheDocument();
    expect(presets.diveFormPresetsAPI.deletePreset).not.toHaveBeenCalled();

    // The row's own control is named after the preset, so this is unambiguously
    // the confirmation's button.
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(presets.diveFormPresetsAPI.deletePreset).toHaveBeenCalledWith(
        RECREATIONAL.uuid,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Recreational")).not.toBeInTheDocument(),
    );
    expect(authAPI.updateProfile).not.toHaveBeenCalled();
  });

  it("restores only the defaults that were missing, and says how many", async () => {
    const basic = aPreset("Basic", ["altitude"], "preset-basic");
    vi.mocked(presets.diveFormPresetsAPI.restoreDefaults).mockResolvedValue([
      basic,
    ]);

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await openFieldsPanel();
    await openPresetsTab();

    await screen.findByText("Recreational");
    await userEvent.click(
      screen.getByRole("button", { name: /restore default presets/i }),
    );

    await waitFor(() =>
      expect(presets.diveFormPresetsAPI.restoreDefaults).toHaveBeenCalled(),
    );
    expect(await screen.findByText("Basic")).toBeInTheDocument();
    expect(stable.toast.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("Added 1 preset"),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// The two moments a value arrives from something the diver operated
// ---------------------------------------------------------------------------

function importFile() {
  // The real input is `hidden` and driven by a button click, so `userEvent.upload`
  // refuses it - `fireEvent.change` is what that click ultimately produces. Same
  // helper as `dive-file-import.render.test.tsx`.
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: {
      files: [
        new File(["{}"], "dive.fit", { type: "application/octet-stream" }),
      ],
    },
  });
}

describe("importing a file onto a form with fields hidden", () => {
  it("brings the gas section back with the cylinders the file carried", async () => {
    // The import path itself stays visibility-blind: it sets whatever the file
    // carries, which is the owner's rule for free. What this pins is the other half -
    // that the section comes back so the diver can see, and correct, a volume the
    // parser guessed.
    stable.auth.user.dive_form_hidden_fields = ["mixtures"];
    vi.mocked(divesAPI.parseDiveFile).mockResolvedValue({
      dive_number: null,
      start_time: null,
      duration: null,
      max_depth: 32.1,
      avg_depth: null,
      bottom_temperature: null,
      water_type: null,
      mixtures: [
        { volume: 11.1, oxygen: 32, helium: 0, start_pressure: 200 },
        { volume: 11.1, oxygen: 50, helium: 0, start_pressure: 180 },
      ],
      cns_start: null,
      cns_end: null,
      otu_start: null,
      otu_end: null,
      surface_pressure_bar: null,
      file_token: "token",
    } as Awaited<ReturnType<typeof divesAPI.parseDiveFile>>);

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument();

    importFile();

    await waitFor(() =>
      expect(screen.getAllByText(/^tank \d$/i)).toHaveLength(2),
    );
    expect(
      screen.getAllByRole("spinbutton", { name: /start pressure/i })[0],
    ).toHaveValue(200);
    // The stored set is untouched: this form shows them, the account still hides them.
    expect(authAPI.updateProfile).not.toHaveBeenCalled();
    expect(stable.auth.user.dive_form_hidden_fields).toEqual(["mixtures"]);
  });
});

describe("loading a gear set onto a form with Weight hidden", () => {
  it("puts the weight box on screen, filled with the set's own", async () => {
    stable.auth.user.dive_form_hidden_fields = ["weight"];
    vi.mocked(gear.fetchAllGearSets).mockResolvedValue([
      {
        uuid: "set-1",
        user_uuid: "user-1",
        name: "Warm water",
        weight: 4,
        gear_items: [],
      } as unknown as Awaited<ReturnType<typeof gear.fetchAllGearSets>>[number],
    ]);

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    expect(
      screen.queryByRole("spinbutton", { name: /^weight/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("combobox", { name: /load a gear set/i }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /warm water/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /^weight/i })).toHaveValue(
        4,
      ),
    );
    expect(authAPI.updateProfile).not.toHaveBeenCalled();
  });
});

describe("hiding the species picker while it is still resolving a pick", () => {
  it("leaves the save button usable", async () => {
    // The picker reports a pending catalog resolve to the card, and the card
    // disables the submit on it. Unmounting it - by unchecking Species, or by
    // applying a preset that hides it - used to leave that report stuck at true and
    // the button on "Adding species..." until a reload: a form wedged by a checkbox.
    vi.mocked(speciesAPI.searchSpecies).mockResolvedValue({
      results: [
        {
          aphia_id: 278400,
          uuid: null,
          scientific_name: "Amphiprion ocellaris",
          common_name: "Ocellaris clownfish",
          rank: "Species",
          status: "accepted",
          matched_name: null,
          source: "wikidata",
          attribution: "Wikidata (CC0)",
        },
      ],
      has_more: false,
    });
    // Never settles, so the resolve is still in flight when the picker goes.
    vi.mocked(speciesAPI.resolveSpecies).mockReturnValue(new Promise(() => {}));

    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);

    await userEvent.type(
      screen.getByLabelText(/species spotted/i),
      "clownfish",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Ocellaris clownfish/ }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /adding species/i }),
      ).toBeDisabled(),
    );

    await openFieldsPanel();
    await userEvent.click(
      screen.getByRole("switch", { name: /^species spotted$/i }),
    );
    await closeFieldsPanel();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /log dive/i })).toBeEnabled(),
    );
  });
});
