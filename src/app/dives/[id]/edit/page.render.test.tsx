import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

const openFieldsPanel = () =>
  userEvent.click(screen.getByRole("button", { name: /fields/i }));

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
    expect(screen.getByRole("checkbox", { name: /^notes$/i })).toBeChecked();
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
    await userEvent.click(screen.getByRole("checkbox", { name: /^notes$/i }));
    // Role-scoped from here: the panel's own "Notes" checkbox answers to the label
    // too, and it stays on the page after the field goes.
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

    await openFieldsPanel();
    const weightBox = () => screen.getByRole("checkbox", { name: /^weight$/i });
    await userEvent.click(weightBox());
    await waitFor(() =>
      expect(
        screen.queryByRole("spinbutton", { name: /^weight/i }),
      ).not.toBeInTheDocument(),
    );

    await userEvent.click(weightBox());
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
