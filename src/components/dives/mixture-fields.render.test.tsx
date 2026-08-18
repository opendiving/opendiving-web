import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { MixtureFields, useMixtureFieldArray } from "./mixture-fields";
import type { DiveFormValues } from "./dive-form-fields";
import type { UnitSystem } from "@/lib/units";

// The pressure boxes and their labels read the diver's units, so these renders need
// an auth context. Held in a mutable box rather than a fixed literal so a test can
// switch systems - `vi.mock`'s factory is hoisted above the file, and `vi.hoisted`
// is what lets it close over something the tests can still reach.
const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

afterEach(() => {
  auth.units = "metric";
});

// The warning sentence is unit-tested in `lib/dive-mixtures.test.ts`. What only a
// render reaches is the announcement wiring: that the `role="status"` region exists
// before the sentence does - a region that mounts together with its text is typically
// not announced at all - and that it settles rather than tracking every keystroke,
// since the sentence quotes the depth.

function Harness({
  mixtures,
  maxDepth,
}: {
  mixtures: DiveFormValues["mixtures"];
  maxDepth: number | null;
}) {
  const form = useForm<DiveFormValues>({
    defaultValues: { mixtures, max_depth: maxDepth } as DiveFormValues,
  });
  const fieldArray = useMixtureFieldArray(form.control);

  return (
    <FormProvider {...form}>
      <MixtureFields control={form.control} fieldArray={fieldArray} />
    </FormProvider>
  );
}

const EAN54 = { volume: 11.1, oxygen: 54, helium: 0 };

afterEach(() => {
  vi.useRealTimers();
});

describe("MixtureFields announcements", () => {
  it("mounts the status region before there is anything to announce", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={10} />);

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("");
  });

  it("announces the warning once it settles", () => {
    vi.useFakeTimers();
    render(<Harness mixtures={[EAN54]} maxDepth={45} />);

    // The visible copy is immediate; the announced copy waits.
    expect(screen.getByRole("status")).toHaveTextContent("");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      /past this mix's 19.6 m limit/i,
    );
  });

  it("keeps the visible copy out of the accessibility tree", () => {
    // Otherwise the sentence is read twice: once from the copy that tracks every
    // keystroke, once from the settled region.
    render(<Harness mixtures={[EAN54]} maxDepth={45} />);

    const visible = screen.getByText(/past this mix's 19.6 m limit/i, {
      ignore: '[role="status"]',
    });
    expect(visible.closest("[aria-hidden]")).not.toBeNull();
  });
});

// Both dive forms can hold zero cylinders - a state the API supports outright and the
// detail card calls the common case for a hand-logged dive - so the card has to say
// something over an empty list, and the last row has to be removable to get there. A
// gate of `index > 0` on the remove button made "no gas recorded" unreachable from
// either form.
describe("MixtureFields with no cylinders", () => {
  it("says the dive records none, rather than showing a bare heading", () => {
    render(<Harness mixtures={[]} maxDepth={30} />);

    expect(
      screen.getByText(/no cylinders recorded for this dive/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument();
  });

  it("lets the last cylinder be removed", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    fireEvent.click(screen.getByRole("button", { name: /remove tank 1/i }));

    expect(screen.queryByText(/^tank 1$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/no cylinders recorded for this dive/i),
    ).toBeInTheDocument();
  });

  it("names each remove button after the tank it removes", () => {
    // The button is an icon and nothing else, so without a label a screen reader
    // reads "button" - once per tank, identically.
    render(<Harness mixtures={[EAN54, EAN54]} maxDepth={30} />);

    expect(
      screen.getByRole("button", { name: /remove tank 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove tank 2/i }),
    ).toBeInTheDocument();
  });
});

// The options one `<select>` offers, in the order it offers them.
function optionsOf(select: HTMLElement): string[] {
  return [...select.querySelectorAll("option")].map((option) => option.value);
}

// Both pickers exist to carry a value an import put there without the diver having
// chosen it, so what a render has to show is that "not recorded" survives a round trip
// through the form as absence rather than as a number or a string - and, for the ppO₂
// one, that a recorded value the list doesn't offer survives it at all.
describe("MixtureFields ppO₂ limit picker", () => {
  it("names the fallback instead of pre-selecting it", () => {
    // Seeding 1.4 would make every cylinder claim a limit the diver never chose, and
    // the MOD above would then be attributed to a decision nobody made.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    const select = screen.getByLabelText(/ppO₂ limit/i);
    expect(select).toHaveValue("");
    expect(
      screen.getByRole("option", { name: /not recorded \(1\.4 default\)/i }),
    ).toBeInTheDocument();
  });

  it("shows a recorded limit, and works the hint's MOD out at it", () => {
    render(<Harness mixtures={[{ ...EAN54, po2_limit: 1.6 }]} maxDepth={20} />);

    expect(screen.getByLabelText(/ppO₂ limit/i)).toHaveValue("1.6");
    // EAN54 at 1.6 is 19.6 m; at the 1.4 default it would be 15.9 m. The hint and
    // the box have to agree, which is the whole reason `ppO2Limit` is one function.
    expect(screen.getByText(/MOD 19\.6 m @ ppO₂ 1\.6/)).toBeInTheDocument();
  });

  it("offers only limits inside the band the API enforces", () => {
    // `ck_dive_mixture_po2_limit_range` is 0.4-2.0, and a value outside it turns a
    // save into a 422 the diver can't read. A picker can't produce one at all,
    // which is most of the reason it replaced the number box.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    const offered = optionsOf(screen.getByLabelText(/ppO₂ limit/i));

    expect(offered).toEqual([
      "",
      "1.0",
      "1.1",
      "1.2",
      "1.3",
      "1.4",
      "1.5",
      "1.6",
    ]);
    expect(
      offered
        .filter((option) => option !== "")
        .every((option) => Number(option) >= 0.4 && Number(option) <= 2.0),
    ).toBe(true);
  });

  it("keeps a recorded limit it doesn't offer, in its place in the list", () => {
    // A `<select>` whose value matches no option renders blank while the form goes
    // on holding the value - so the box would read "not recorded" over a cylinder
    // that records 1.45, and the diver would find out by saving.
    render(
      <Harness mixtures={[{ ...EAN54, po2_limit: 1.45 }]} maxDepth={30} />,
    );

    const select = screen.getByLabelText(/ppO₂ limit/i);

    expect(select).toHaveValue("1.45");
    expect(optionsOf(select)).toEqual([
      "",
      "1.0",
      "1.1",
      "1.2",
      "1.3",
      "1.4",
      "1.45",
      "1.5",
      "1.6",
    ]);
  });

  it("selects a limit the diver picks", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={20} />);
    const select = screen.getByLabelText(/ppO₂ limit/i);

    fireEvent.change(select, { target: { value: "1.6" } });

    expect(select).toHaveValue("1.6");
    // And the number reaches the form as a number, not as the option's string -
    // `normalizeMixtures` passes `po2_limit` straight to the API.
    expect(screen.getByText(/MOD 19\.6 m @ ppO₂ 1\.6/)).toBeInTheDocument();
  });
});

describe("MixtureFields role input", () => {
  it("defaults to an explicit 'not recorded', which most cylinders are", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(screen.getByLabelText(/^role$/i)).toHaveValue("");
    expect(
      // Anchored: the ppO₂ picker's own empty option reads "Not recorded (1.4
      // default)", and a loose match now finds both.
      screen.getByRole("option", { name: /^not recorded$/i }),
    ).toBeInTheDocument();
  });

  it("offers exactly the roles the API accepts", () => {
    // `GAS_ROLES` mirrors the API's `GasRole` enum, which is `extra="forbid"` on the
    // way in - an option this list invented would be rejected on save.
    //
    // Scoped to this `<select>` rather than swept off the whole card, which is what
    // it did while it was the only one: the ppO₂ picker beside it is a second list
    // of options and would fail this by existing.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(optionsOf(screen.getByLabelText(/^role$/i))).toEqual([
      "",
      "bottom",
      "deco",
      "diluent",
      "oxygen",
    ]);
  });

  it("shows a role an import recorded", () => {
    render(<Harness mixtures={[{ ...EAN54, role: "deco" }]} maxDepth={30} />);

    expect(screen.getByLabelText(/^role$/i)).toHaveValue("deco");
  });

  it("lets an imported role actually be cleared", () => {
    // The whole reason this is a plain `<select>` with a real "Not recorded" option
    // rather than shadcn's `Select`. Writing `undefined` on clear made react-hook-form
    // re-display the default, so choosing "Not recorded" snapped back to Deco - the
    // trap `diveMixtureSchema` documents and the numeric fields already dodge with "".
    render(<Harness mixtures={[{ ...EAN54, role: "deco" }]} maxDepth={30} />);
    const select = screen.getByLabelText(/^role$/i);

    fireEvent.change(select, { target: { value: "" } });

    expect(select).toHaveValue("");
  });

  it("lets a recorded ppO₂ limit be cleared back to the default", () => {
    render(<Harness mixtures={[{ ...EAN54, po2_limit: 1.6 }]} maxDepth={30} />);
    const select = screen.getByLabelText(/ppO₂ limit/i);

    fireEvent.change(select, { target: { value: "" } });

    expect(select).toHaveValue("");
    // And the hint falls back to naming the working default, rather than keeping the
    // limit the box no longer holds.
    expect(screen.getByText(/@ ppO₂ 1\.4/)).toBeInTheDocument();
  });
});
