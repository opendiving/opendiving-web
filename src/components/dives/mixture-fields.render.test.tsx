import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { MixtureFields, useMixtureFieldArray } from "./mixture-fields";
import type { DiveFormValues } from "./dive-form-fields";
import type { DiveFormFieldKey } from "@/lib/dive-form-fields";
import type { UnitSystem } from "@/lib/units";
import {
  parseEntryUnits,
  readStoredEntryUnits,
  writeEntryUnits,
} from "@/lib/entry-units";
import { memoryStorage, useStorage } from "@/test/memory-storage";

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
  hidden = [],
}: {
  mixtures: DiveFormValues["mixtures"];
  maxDepth: number | null;
  // The per-cylinder keys this form is *not* showing, as the Fields dialog would
  // have it. Given as the hidden set rather than as a predicate so a test reads the
  // way the stored preference does.
  hidden?: DiveFormFieldKey[];
}) {
  const form = useForm<DiveFormValues>({
    defaultValues: { mixtures, max_depth: maxDepth } as DiveFormValues,
  });
  const fieldArray = useMixtureFieldArray(form.control);

  return (
    <FormProvider {...form}>
      <MixtureFields
        control={form.control}
        fieldArray={fieldArray}
        isVisible={(key) => !hidden.includes(key)}
      />
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

// The add button sits under the tank cards rather than in the section header, so the
// control and the card it appends are adjacent and in reading order. DOM order is the
// half of that jsdom can actually check - the layout half is measured in a browser and
// recorded in DECISIONS.md - and it is the half that a later edit to this component
// would silently undo.
describe("MixtureFields add button placement", () => {
  it("follows the last tank rather than preceding the first", () => {
    render(<Harness mixtures={[EAN54, EAN54]} maxDepth={30} />);

    const add = screen.getByRole("button", { name: /add mixture/i });
    const lastRemove = screen.getByRole("button", { name: /remove tank 2/i });

    expect(
      lastRemove.compareDocumentPosition(add) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("follows the empty-state line when there are no tanks", () => {
    render(<Harness mixtures={[]} maxDepth={30} />);

    const add = screen.getByRole("button", { name: /add mixture/i });
    const empty = screen.getByText(/no cylinders recorded for this dive/i);

    expect(
      empty.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
      // Scoped to this `<select>`, not swept off the card. Anchoring alone used
      // to be enough - the ppO₂ picker's own empty option reads "Not recorded
      // (1.4 default)", so only a loose match found two - but Usage beside it now
      // spells its empty option exactly the way Role does, and `getByRole` throws
      // on the pair.
      within(screen.getByLabelText(/^role$/i)).getByRole("option", {
        name: /^not recorded$/i,
      }),
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

  it("defaults usage to an explicit 'not recorded', which every import is", () => {
    // No format this app parses carries the flag, so unlike Role this one is
    // *always* unset until the diver answers it.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(screen.getByLabelText(/^usage$/i)).toHaveValue("");
  });

  it("offers exactly the usages the API accepts", () => {
    // `TANK_USAGE` mirrors the API's `TankUsage` enum, which is `extra="forbid"`
    // on the way in - an option this list invented would be rejected on save.
    // Scoped to this `<select>` for the same reason the role one is.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(optionsOf(screen.getByLabelText(/^usage$/i))).toEqual([
      "",
      "parallel",
      "staged",
    ]);
  });

  it("spells out what each usage means, which the one-word labels do not", () => {
    // The flag changes what the API computes, so choosing it by guessing at the
    // word is the outcome worth spending option width to prevent.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);
    const select = screen.getByLabelText(/^usage$/i);

    expect(
      within(select).getByRole("option", { name: /sidemount \/ independent/i }),
    ).toBeInTheDocument();
    expect(
      within(select).getByRole("option", { name: /own depth/i }),
    ).toBeInTheDocument();
  });

  it("lets a chosen usage be cleared back to not recorded", () => {
    // Same react-hook-form trap as Role: writing `undefined` on clear re-displays
    // the field's default, so "Not recorded" would snap back to Parallel.
    render(
      <Harness mixtures={[{ ...EAN54, usage: "parallel" }]} maxDepth={30} />,
    );
    const select = screen.getByLabelText(/^usage$/i);
    expect(select).toHaveValue("parallel");

    fireEvent.change(select, { target: { value: "" } });

    expect(select).toHaveValue("");
  });

  it("lets each cylinder answer usage for itself", () => {
    // Per row, not once for the dive: a parallel pair plus a staged bottle is a
    // real set, and it is the one the API refuses by design - which it can only
    // do if the form can express it.
    render(
      <Harness
        mixtures={[
          { ...EAN54, usage: "parallel" },
          { ...EAN54, usage: "staged" },
        ]}
        maxDepth={30}
      />,
    );

    const selects = screen.getAllByLabelText(/^usage$/i);
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue("parallel");
    expect(selects[1]).toHaveValue("staged");
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

// A cylinder may record a mix with no vessel and a vessel with no mix, so all three
// of these boxes have to be clearable and have to *stay* clear. The trap is the one
// `role` documents above: `undefined` is what react-hook-form reads as "show the
// default", so a field that clears to it fills itself straight back in.
describe("MixtureFields blank gas fields", () => {
  it("lets an imported cylinder size be cleared and stay cleared", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);
    const volume = screen.getByLabelText("Volume (L)");

    fireEvent.change(volume, { target: { value: "" } });

    expect(volume).toHaveValue("");
  });

  it("lets the O₂ and He boxes be cleared and stay cleared", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);
    const oxygen = screen.getByLabelText("O₂ (%)");
    const helium = screen.getByLabelText("He (%)");

    fireEvent.change(oxygen, { target: { value: "" } });
    fireEvent.change(helium, { target: { value: "" } });

    expect(oxygen).toHaveValue(null);
    expect(helium).toHaveValue(null);
  });

  it("stops naming the gas once the O₂ box is empty", () => {
    // Not "EAN0" and not the EAN54 that was there: an unrecorded fraction is not a
    // gas, so the hint under the boxes has nothing to say and says nothing.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);
    expect(screen.getByText(/EAN54/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("O₂ (%)"), {
      target: { value: "" },
    });

    expect(screen.queryByText(/EAN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MOD/)).not.toBeInTheDocument();
  });

  it("renders an empty volume box for a cylinder that records no size", () => {
    render(<Harness mixtures={[{ ...EAN54, volume: "" }]} maxDepth={30} />);

    expect(screen.getByLabelText("Volume (L)")).toHaveValue("");
    // The gas it does record is still named: the two facts are independent, which is
    // the whole reason the column became nullable on its own.
    expect(screen.getByText(/EAN54/)).toBeInTheDocument();
  });
});

// The per-dimension entry switch. Every test here installs its own storage - under
// this runner `window.localStorage` reads back as `undefined` and the override
// module's try/catch turns that into "no override", so a suite written without it
// passes with the whole feature deleted.
describe("MixtureFields entry units", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  const pressureToggle = () =>
    screen.getByLabelText("bar | psi — switch pressure entry to psi");

  it("enters in the account's units until the toggle is pressed", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(screen.getByLabelText("Start pressure (bar)")).toBeInTheDocument();
  });

  it("relabels and reformats both pressures when flipped to psi", async () => {
    render(
      <Harness
        mixtures={[{ ...EAN54, start_pressure: 206.84, end_pressure: 51.71 }]}
        maxDepth={30}
      />,
    );

    await userEvent.click(pressureToggle());

    expect(screen.getByLabelText("Start pressure (psi)")).toHaveValue(3000);
    expect(screen.getByLabelText("End pressure (psi)")).toHaveValue(750);
  });

  it("commits the bar behind a pressure typed in psi", async () => {
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    await userEvent.click(pressureToggle());
    await userEvent.type(screen.getByLabelText("Start pressure (psi)"), "3000");

    // Flipping back is what shows what form state is actually holding: metric,
    // whatever the box was labelled while the number went in. That invariant is
    // what keeps the wire shape and every Zod rule untouched by this feature -
    // had 3000 landed in state, this box would read 3000.
    await userEvent.click(
      screen.getByLabelText("bar | psi — switch pressure entry to bar"),
    );

    expect(screen.getByLabelText("Start pressure (bar)")).toHaveValue(206.84);
  });

  // One control for the section, not one per box: the pressure fields repeat per
  // tank, so a per-field toggle would put eight identically-named controls on a
  // four-cylinder dive - and `getByLabelText` would throw on all of them.
  it("governs every tank from one uniquely-named control", async () => {
    render(
      <Harness
        mixtures={[
          { ...EAN54, start_pressure: 206.84 },
          { ...EAN54, start_pressure: 206.84 },
        ]}
        maxDepth={30}
      />,
    );

    await userEvent.click(pressureToggle());

    expect(screen.getAllByLabelText("Start pressure (psi)")).toHaveLength(2);
    expect(screen.getAllByLabelText("End pressure (psi)")).toHaveLength(2);
  });

  // The create form seeds `mixtures: []`, and the header renders above the empty
  // state - so an ungated toggle would open every fresh form with a control
  // governing no visible field.
  it("shows no pressure toggle over an empty cylinder list", () => {
    render(<Harness mixtures={[]} maxDepth={30} />);

    expect(screen.getByText("Gas Mixtures")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/switch pressure entry/),
    ).not.toBeInTheDocument();
  });

  it("brings the toggle back with the first cylinder, already flipped", async () => {
    // A diver who flipped pressure on a previous dive: the gate hides the control,
    // never the stored choice.
    writeEntryUnits({ pressure: "imperial" });
    render(<Harness mixtures={[]} maxDepth={30} />);

    await userEvent.click(screen.getByRole("button", { name: /add mixture/i }));

    expect(
      screen.getByLabelText("bar | psi — switch pressure entry to bar"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Start pressure (psi)")).toBeInTheDocument();
  });

  it("hides the toggle again without forgetting the choice", async () => {
    writeEntryUnits({ pressure: "imperial" });
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    await userEvent.click(
      screen.getByRole("button", { name: /remove tank 1/i }),
    );

    expect(
      screen.queryByLabelText(/switch pressure entry/),
    ).not.toBeInTheDocument();
    expect(parseEntryUnits(readStoredEntryUnits())).toEqual({
      pressure: "imperial",
    });
  });

  // The hint's MOD/END/EAD are depths, so they follow the depth entry units - a
  // diver typing depths in feet must not be warned about a MOD in metres.
  it("works the MOD hint out in the depth entry units", () => {
    writeEntryUnits({ depth: "imperial" });
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(screen.getByText(/MOD \d+ ft @/)).toBeInTheDocument();
    expect(screen.queryByText(/MOD [\d.]+ m @/)).not.toBeInTheDocument();
  });

  // The two dimensions are independent: flipping depth leaves the pressure boxes
  // exactly where they were.
  it("leaves the pressure boxes alone when depth is the one flipped", () => {
    writeEntryUnits({ depth: "imperial" });
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(screen.getByLabelText("Start pressure (bar)")).toBeInTheDocument();
  });
});

describe("MixtureFields under a hidden set", () => {
  const AIR = { volume: 11.1, oxygen: 21, helium: 0 };

  it("takes one input off every tank card", () => {
    render(
      <Harness
        mixtures={[AIR, AIR]}
        maxDepth={20}
        hidden={["mixture.role", "mixture.po2_limit"]}
      />,
    );

    expect(screen.getAllByLabelText(/^usage$/i)).toHaveLength(2);
    expect(screen.queryByLabelText(/^role$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ppO₂ limit/i)).not.toBeInTheDocument();
    // The card is still a card: what the cylinder holds never hides.
    expect(screen.getAllByLabelText(/O₂ \(%\)/)).toHaveLength(2);
    expect(screen.getAllByLabelText(/volume/i)).toHaveLength(2);
  });

  it("keeps the pressure toggle while either pressure is on screen", () => {
    render(
      <Harness
        mixtures={[AIR]}
        maxDepth={20}
        hidden={["mixture.start_pressure"]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /switch pressure entry/i }),
    ).toBeInTheDocument();
  });

  it("drops the pressure toggle when both pressures are hidden", () => {
    // Pressure is the one dimension whose single toggle governs two hideable keys,
    // so it needs a condition the per-field label rows do not: a control over
    // nothing is a control that converts nothing.
    render(
      <Harness
        mixtures={[AIR]}
        maxDepth={20}
        hidden={["mixture.start_pressure", "mixture.end_pressure"]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /switch pressure entry/i }),
    ).not.toBeInTheDocument();
    // And the cylinder is still there - only the two boxes and their control went.
    expect(screen.getByText(/^tank 1$/i)).toBeInTheDocument();
  });

  it("still has no pressure toggle when there is no cylinder to convert", () => {
    // The older gate, unchanged: the create form seeds no mixtures.
    render(<Harness mixtures={[]} maxDepth={20} />);

    expect(
      screen.queryByRole("button", { name: /switch pressure entry/i }),
    ).not.toBeInTheDocument();
  });
});
