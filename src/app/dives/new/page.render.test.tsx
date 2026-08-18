import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewDivePage from "./page";
import { divesAPI, type Dive } from "@/lib/api/dives";

// The seam this covers is the page's own seeding, which no unit test can reach: the
// form's `defaultValues` and the last-dive prefill both decide what `mixtures` holds
// before the diver touches anything, and `onSubmit` sends it unconditionally. The
// question is what a diver who never opens the gas card ends up with on the wire -
// and the answer used to be a cylinder the page invented (an 11.1 L of air), which
// `prefillFromLastDive` then carried to the next dive and `diveModWarning` was happy
// to raise a depth warning against.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
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

vi.mock("@/lib/api/gear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    fetchAllGearSets: vi.fn(),
    gearAPI: { ...actual.gearAPI, getGearItems: vi.fn() },
  };
});

const { tripsAPI } = await import("@/lib/api/trips");
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const gear = await import("@/lib/api/gear");

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
});

// Everything the create schema requires that the page doesn't already seed. Dive
// number and start time arrive filled in; duration does not.
async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText(/duration/i), "45:00");
}

const logDive = () =>
  userEvent.click(screen.getByRole("button", { name: /log dive/i }));

describe("logging a dive without touching the gas card", () => {
  it("sends no mixtures at all", async () => {
    render(<NewDivePage />);
    await screen.findByLabelText(/duration/i);
    await fillRequiredFields();

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
    await fillRequiredFields();

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
    await fillRequiredFields();

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
});
