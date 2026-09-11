import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditDivePage from "./page";
import { divesAPI, type Dive } from "@/lib/api/dives";

// The seam here is the *first* of the four moments a value arrives from outside the
// diver's typing: the edit form's own load. A dive that records notes has to show its
// notes even under a preset that hides them, because an edit form quietly holding data
// the diver cannot see is the one thing this feature must not do. Everything else
// about the edit page is covered by the unit tests behind `diveToFormValues` and
// `buildDiveUpdate`; what only a render reaches is the reveal and what a hide does to
// the PATCH body afterwards.
//
// Every mock is returned by identity, and for `user` that is load-bearing - see the
// long note in `dives/new/page.render.test.tsx`, which this harness follows.
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
  params: { id: "dive-1" } as Record<string, string>,
  searchParams: new URLSearchParams(),
  toast: { toast: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
  useParams: () => stable.params,
  useSearchParams: () => stable.searchParams,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => stable.toast,
}));

vi.mock("@/lib/api/dives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: {
      ...actual.divesAPI,
      getDive: vi.fn(),
      updateDive: vi.fn(),
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

vi.mock("@/lib/api/dive-form-presets", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/dive-form-presets")>();
  return { ...actual, fetchAllDiveFormPresets: vi.fn() };
});

vi.mock("@/lib/api/trips", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/trips")>();
  return { ...actual, tripsAPI: { ...actual.tripsAPI, getTrips: vi.fn() } };
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

vi.mock("@/lib/api/gear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    fetchAllGearSets: vi.fn(),
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
    species: [],
    ...overrides,
  }) as Dive;

beforeEach(() => {
  vi.clearAllMocks();
  stable.auth.user.dive_form_hidden_fields = [];
  vi.mocked(divesAPI.getDive).mockResolvedValue(storedDive());
  vi.mocked(divesAPI.updateDive).mockResolvedValue({ message: "ok" });
  vi.mocked(authAPI.updateProfile).mockResolvedValue(undefined);
  vi.mocked(presets.fetchAllDiveFormPresets).mockResolvedValue([]);
  vi.mocked(tripsAPI.getTrips).mockResolvedValue(emptyPage());
  vi.mocked(diveSitesAPI.getDiveSites).mockResolvedValue(emptyPage());
  vi.mocked(gear.fetchAllGearSets).mockResolvedValue([]);
  vi.mocked(gear.gearAPI.getGearItems).mockResolvedValue(emptyPage());
  vi.mocked(speciesAPI.searchSpecies).mockResolvedValue({
    results: [],
    has_more: false,
  });
});

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

const saveChanges = () =>
  userEvent.click(screen.getByRole("button", { name: /save changes/i }));

describe("a dive whose fields the diver keeps hidden", () => {
  it("shows the notes it records, and says why they are on screen", async () => {
    stable.auth.user.dive_form_hidden_fields = ["notes"];
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({ notes: "Thistlegorm, holds 2 and 4" }),
    );

    render(<EditDivePage />);

    await waitFor(() =>
      expect(screen.getByLabelText(/^notes$/i)).toHaveValue(
        "Thistlegorm, holds 2 and 4",
      ),
    );

    await openFieldsPanel();
    expect(screen.getByRole("switch", { name: /^notes$/i })).toBeChecked();
    expect(
      screen.getByText(/shown because it holds a value/i),
    ).toBeInTheDocument();
  });

  it("keeps the notes on the wire after the diver hides them again", async () => {
    // Hide and show are value-preserving on this form: unmounting an input never
    // changes form state, and the edit page has no defaults to write over it. So the
    // PATCH still carries what the dive already said.
    stable.auth.user.dive_form_hidden_fields = [];
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({ notes: "Thistlegorm, holds 2 and 4" }),
    );

    render(<EditDivePage />);
    await waitFor(() =>
      expect(screen.getByLabelText(/^notes$/i)).toHaveValue(
        "Thistlegorm, holds 2 and 4",
      ),
    );

    await openFieldsPanel();
    await userEvent.click(screen.getByRole("switch", { name: /^notes$/i }));
    await closeFieldsPanel();
    // Role-scoped from here: the dialog's own "Notes" switch answers to the label
    // too, and it stays mounted after the field goes.
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /^notes$/i }),
      ).not.toBeInTheDocument(),
    );

    await saveChanges();

    await waitFor(() => expect(divesAPI.updateDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.updateDive).mock.calls[0][1].notes).toBe(
      "Thistlegorm, holds 2 and 4",
    );
  });

  it("brings the gas section back for a dive that records cylinders", async () => {
    stable.auth.user.dive_form_hidden_fields = [
      "mixtures",
      "mixture.start_pressure",
      "mixture.end_pressure",
    ];
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
          },
          {
            id: 8,
            volume: 11.1,
            oxygen: 21,
            helium: 0,
            start_pressure: 200,
            end_pressure: 50,
          },
        ] as Dive["mixtures"],
      }),
    );

    render(<EditDivePage />);

    // Both the section and the pressure columns come back: a per-cylinder key is
    // revealed when *any* tank holds a value for it, so an imported start pressure
    // is on screen rather than behind an unchecked box.
    await waitFor(() =>
      expect(screen.getAllByText(/^tank \d$/i)).toHaveLength(2),
    );
    expect(
      screen.getAllByRole("spinbutton", { name: /start pressure/i }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("spinbutton", { name: /end pressure/i })[0],
    ).toHaveValue(60);
  });

  it("leaves a column hidden when no cylinder records it", async () => {
    stable.auth.user.dive_form_hidden_fields = ["mixtures", "mixture.role"];
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({
        mixtures: [
          { id: 7, volume: 15, oxygen: 32, helium: 0 },
        ] as Dive["mixtures"],
      }),
    );

    render(<EditDivePage />);

    await waitFor(() => expect(screen.getByText(/^tank 1$/i)).toBeVisible());
    expect(screen.queryByLabelText(/^role$/i)).not.toBeInTheDocument();
  });

  it("writes nothing when a field is hidden and shown again", async () => {
    // The edit form has no defaults, so hide and show are purely render changes -
    // the fill-on-show and empty-on-hide rules belong to the *new* form alone. A
    // weight the dive records survives a round trip through the panel untouched.
    stable.auth.user.dive_form_hidden_fields = ["weight"];
    vi.mocked(divesAPI.getDive).mockResolvedValue(storedDive({ weight: 8 }));

    render(<EditDivePage />);

    // On screen at load despite the stored set, because the dive records it.
    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /^weight/i })).toHaveValue(
        8,
      ),
    );

    const weightSwitch = () =>
      screen.getByRole("switch", { name: /^weight$/i });

    await openFieldsPanel();
    await userEvent.click(weightSwitch());
    await closeFieldsPanel();
    await waitFor(() =>
      expect(
        screen.queryByRole("spinbutton", { name: /^weight/i }),
      ).not.toBeInTheDocument(),
    );

    await openFieldsPanel();
    await userEvent.click(weightSwitch());
    await closeFieldsPanel();
    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /^weight/i })).toHaveValue(
        8,
      ),
    );

    await saveChanges();
    await waitFor(() => expect(divesAPI.updateDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.updateDive).mock.calls[0][1].weight).toBe(8);
  });
});

// The bug this file's `storedDive` could never have caught: every fixture in the
// suite carried a depth a diver would type. An imported one does not.
//
// `2.70000029` is a float32 artefact the UDDF reader really produces and the API
// really stores - `avg_depth` is a `Float` column with no rounding anywhere on the
// way in, deliberately, because the reading belongs to the diver's computer rather
// than to us. Against `step="0.01"` that is a `stepMismatch`, and the browser
// cancels the submit before `handleSubmit` runs: no request, no message, no field
// marked invalid. The fix is that no `Float`-backed box declares a step at all.
describe("a dive whose depth carries more precision than a step would allow", () => {
  const IMPORTED_AVG_DEPTH = 2.70000029;

  it("saves an imported average depth untouched", async () => {
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({ max_depth: 31.10000038, avg_depth: IMPORTED_AVG_DEPTH }),
    );

    render(<EditDivePage />);

    const box = await screen.findByRole("spinbutton", {
      name: /^average depth/i,
    });
    // Shown at its own precision, which is the pass-through metric entry has
    // always been - the step was the only thing standing between that and a save.
    expect(box).toHaveValue(IMPORTED_AVG_DEPTH);
    expect((box as HTMLInputElement).validity.stepMismatch).toBe(false);

    await saveChanges();

    await waitFor(() => expect(divesAPI.updateDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.updateDive).mock.calls[0][1].avg_depth).toBe(
      IMPORTED_AVG_DEPTH,
    );
  });

  it("saves a weight that is not a whole half-kilo", async () => {
    // What a diver who enters in pounds already stores: 13 lb commits 5.9 kg, and
    // `step="0.5"` refused it the moment they switched the toggle back to metric.
    vi.mocked(divesAPI.getDive).mockResolvedValue(storedDive({ weight: 5.9 }));

    render(<EditDivePage />);

    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /^weight/i })).toHaveValue(
        5.9,
      ),
    );

    await saveChanges();

    await waitFor(() => expect(divesAPI.updateDive).toHaveBeenCalled());
    expect(vi.mocked(divesAPI.updateDive).mock.calls[0][1].weight).toBe(5.9);
  });
});

// The worse half of the same bug, and the half that outlives any one `step`: a form
// the browser refuses to submit has to say so. `bottom_temperature` is what proves
// it, because it is the one box whose native bounds the Zod schema does not mirror -
// so nothing else on the page would have drawn a message either.
describe("a submit the browser refuses", () => {
  // `FormApiError` is a live region that is always mounted and `sr-only` until it
  // has something to say, so what is asserted is the text arriving in it.
  const saveIsBlocked = () => screen.findByText(/would not submit this form/i);

  it("says which field it refused, instead of doing nothing", async () => {
    // A Fahrenheit reading that landed in a Celsius column - the shape a bad
    // conversion leaves behind, and 78.8 is over the box's own 50 °C ceiling.
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({ bottom_temperature: 78.8 }),
    );

    render(<EditDivePage />);
    await waitFor(() =>
      expect(
        screen.getByRole("spinbutton", { name: /^bottom temperature/i }),
      ).toHaveValue(78.8),
    );

    await saveChanges();

    const alert = await saveIsBlocked();
    expect(alert).toHaveTextContent(/bottom temperature/i);
    expect(divesAPI.updateDive).not.toHaveBeenCalled();
  });

  it("clears the message once the value is one the browser accepts", async () => {
    vi.mocked(divesAPI.getDive).mockResolvedValue(
      storedDive({ bottom_temperature: 78.8 }),
    );

    render(<EditDivePage />);
    const box = await screen.findByRole("spinbutton", {
      name: /^bottom temperature/i,
    });

    await saveChanges();
    await saveIsBlocked();

    await userEvent.clear(box);
    await userEvent.type(box, "26.5");
    await saveChanges();

    await waitFor(() => expect(divesAPI.updateDive).toHaveBeenCalled());
    expect(
      screen.queryByText(/would not submit this form/i),
    ).not.toBeInTheDocument();
  });
});
