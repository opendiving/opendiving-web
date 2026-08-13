import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { MixtureFields, useMixtureFieldArray } from "./mixture-fields";
import type { DiveFormValues } from "./dive-form-fields";

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

const EAN54 = { name: "Deco", volume: 11.1, oxygen: 54, helium: 0 };

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

// Both new inputs exist to carry a value an import put there without the diver having
// chosen it, so what a render has to show is that "not recorded" survives a round trip
// through the form as absence rather than as a number or a string.
describe("MixtureFields ppO₂ limit input", () => {
  it("names the fallback instead of pre-filling it", () => {
    // Seeding 1.4 would make every cylinder claim a limit the diver never chose, and
    // the MOD above would then be attributed to a decision nobody made.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    const input = screen.getByLabelText(/ppO₂ limit/i);
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute("placeholder", "1.4 (default)");
  });

  it("shows a recorded limit, and works the hint's MOD out at it", () => {
    render(<Harness mixtures={[{ ...EAN54, po2_limit: 1.6 }]} maxDepth={20} />);

    expect(screen.getByLabelText(/ppO₂ limit/i)).toHaveValue(1.6);
    // EAN54 at 1.6 is 19.6 m; at the 1.4 default it would be 15.9 m. The hint and
    // the box have to agree, which is the whole reason `ppO2Limit` is one function.
    expect(screen.getByText(/MOD 19\.6 m @ ppO₂ 1\.6/)).toBeInTheDocument();
  });

  it("bounds the box to the band the API enforces", () => {
    // `ck_dive_mixture_po2_limit_range` is 0.4-2.0. A box that let 3 through would
    // turn a save into a 422 the diver can't read.
    const input = render(
      <Harness mixtures={[EAN54]} maxDepth={30} />,
    ).container.querySelector('input[name="mixtures.0.po2_limit"]');

    expect(input).toHaveAttribute("min", "0.4");
    expect(input).toHaveAttribute("max", "2");
  });
});

describe("MixtureFields role input", () => {
  it("defaults to an explicit 'not recorded', which most cylinders are", () => {
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(screen.getByLabelText(/^role$/i)).toHaveValue("");
    expect(
      screen.getByRole("option", { name: /not recorded/i }),
    ).toBeInTheDocument();
  });

  it("offers exactly the roles the API accepts", () => {
    // `GAS_ROLES` mirrors the API's `GasRole` enum, which is `extra="forbid"` on the
    // way in - an option this list invented would be rejected on save.
    render(<Harness mixtures={[EAN54]} maxDepth={30} />);

    expect(
      screen
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual(["", "bottom", "deco", "diluent", "oxygen"]);
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
    const input = screen.getByLabelText(/ppO₂ limit/i);

    fireEvent.change(input, { target: { value: "" } });

    expect(input).toHaveValue(null);
    // And the hint falls back to naming the working default, rather than keeping the
    // limit the box no longer holds.
    expect(screen.getByText(/@ ppO₂ 1\.4/)).toBeInTheDocument();
  });
});
