import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
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
