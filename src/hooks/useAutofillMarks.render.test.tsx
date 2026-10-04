import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useFieldArray, useForm, type UseFormReturn } from "react-hook-form";
import {
  realignMixtureMarks,
  useAutofillMarks,
  type AutofillMarks,
} from "./useAutofillMarks";

interface Values {
  water_type: string;
  mixtures: { oxygen: number | ""; volume: number | "" }[];
}

const handle: {
  form?: UseFormReturn<Values>;
  marks?: AutofillMarks;
  append?: (row: Values["mixtures"][number]) => void;
  remove?: (index: number) => void;
} = {};

function Form() {
  const form = useForm<Values>({
    defaultValues: { water_type: "", mixtures: [] },
  });
  const { append, remove } = useFieldArray({
    control: form.control,
    name: "mixtures",
  });
  const marks = useAutofillMarks(form);
  Object.assign(handle, { form, marks, append, remove });
  return <input aria-label="Water type" {...form.register("water_type")} />;
}

const write = (value: string) =>
  act(() => {
    handle.marks!.note(
      "water_type",
      handle.form!.getValues("water_type"),
      value,
    );
    handle.form!.setValue("water_type", value);
  });

describe("useAutofillMarks", () => {
  it("marks a field an automatic write changed, and only that", () => {
    render(<Form />);

    write("");
    expect(handle.marks!.isMarked("water_type")).toBe(false);
    write("salt");
    expect(handle.marks!.isMarked("water_type")).toBe(true);
  });

  it("leaves a mark through any write but the diver's own", () => {
    render(<Form />);
    write("salt");

    act(() => handle.form!.setValue("water_type", "fresh"));
    write("");
    expect(handle.marks!.isMarked("water_type")).toBe(true);

    fireEvent.change(screen.getByLabelText("Water type"), {
      target: { value: "brackish" },
    });
    expect(handle.marks!.isMarked("water_type")).toBe(false);
  });

  it("moves a cylinder's marks with it, and gives a new one none", async () => {
    render(<Form />);
    const rows = [
      { oxygen: 32, volume: 12 },
      { oxygen: 50, volume: 7 },
    ];
    act(() => {
      handle.marks!.note("mixtures", [], rows);
      handle.form!.setValue("mixtures", rows);
    });

    await act(async () => handle.remove!(0));
    await act(async () => handle.append!({ oxygen: 21, volume: 11.1 }));

    expect(handle.marks!.isMarked("mixtures.0.oxygen")).toBe(true);
    expect(handle.marks!.isMarked("mixtures.1.oxygen")).toBe(false);
  });
});

describe("realignMixtureMarks", () => {
  it("drops the marks of a row that matches nothing", () => {
    expect(
      realignMixtureMarks(
        { "mixtures.0.oxygen": 32, "mixtures.1.oxygen": 50, notes: "x" },
        [{ oxygen: 32 }, { oxygen: 50 }],
        [{ oxygen: 21 }, { oxygen: 50 }],
      ),
    ).toEqual({ notes: "x", "mixtures.1.oxygen": 50 });
  });
});
